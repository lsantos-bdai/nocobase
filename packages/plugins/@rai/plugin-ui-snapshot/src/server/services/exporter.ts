/**
 * Exporter Service
 *
 * Converts NocoBase flowModel tree → Recipe format.
 * Walks the flowModel tree and extracts essential configuration.
 */
import type { Database } from '@nocobase/database';
import type {
  Recipe,
  Layout,
  Row,
  Column,
  Block,
  TableBlock,
  ChartBlock,
  DetailsBlock,
  FormBlock,
  MarkdownBlock,
  ColumnConfig,
  RowAction,
  ToolbarAction,
  Popup,
  Tab,
  InlineBlock,
  FieldConfig,
  FormFieldConfig,
  BlockAction,
  FlowModel,
  GridSettings,
  DisplayType,
  TemplateDefinition,
  ReferenceBlockInline,
} from '../types';
import { RouteResolver } from './route-resolver';

// Template reference info collected during pre-scan
interface TemplateRef {
  templateUid: string;
  templateName: string;
  targetUid: string;
}

export class Exporter {
  private routeResolver: RouteResolver;
  private collectionMap: Map<string, string> = new Map(); // t_xxx → alias
  private blockIdCounters: Map<string, number> = new Map(); // baseId → count
  private blockUidToId: Map<string, string> = new Map(); // uid → blockId
  private templates: Map<string, TemplateDefinition> = new Map(); // templateKey → definition
  private templateUidToKey: Map<string, string> = new Map(); // templateUid → recipe key
  private templateKeyCounters: Map<string, number> = new Map(); // base key → count
  private pendingTemplates: Map<string, TemplateRef> = new Map(); // templateUid → ref (queue)

  constructor(private db: Database) {
    this.routeResolver = new RouteResolver(db);
  }

  /**
   * Export a page at the given path to Recipe format
   */
  async export(path: string): Promise<Recipe> {
    // Resolve the path to get page info
    const resolved = await this.routeResolver.resolveByPath(path);
    if (!resolved) {
      throw new Error(`Page not found: ${path}`);
    }

    // Get the flowModel tree for this page
    const flowModels = await this.routeResolver.getFlowModelTree(resolved.pageUid);
    if (flowModels.length === 0) {
      throw new Error(`No flowModels found for page: ${path}`);
    }

    // Find the BlockGridModel (contains the page layout)
    const blockGrid = flowModels.find(m => m.use === 'BlockGridModel');
    if (!blockGrid) {
      throw new Error(`No BlockGridModel found for page: ${path}`);
    }

    // Build a map of all flowModels by UID for easy lookup
    const modelMap = new Map<string, FlowModel>();
    for (const model of flowModels) {
      modelMap.set(model.uid, model);
    }

    // Find all block models (children of BlockGridModel)
    const blockModels = flowModels.filter(
      m => m.parentId === blockGrid.uid && m.subKey === 'items'
    );

    // Pre-generate block IDs FIRST to ensure consistency between layout and blocks
    this.collectionMap.clear();
    this.blockIdCounters.clear();
    this.blockUidToId.clear();
    this.templates.clear();
    this.templateUidToKey.clear();
    this.templateKeyCounters.clear();
    this.pendingTemplates.clear();
    for (const model of blockModels) {
      const blockId = this.generateBlockId(model);
      this.blockUidToId.set(model.uid, blockId);
    }

    // ========================================================================
    // PRE-SCAN PHASE: Collect and extract ALL templates before main extraction
    // ========================================================================

    // Pass 1: Scan the tree and collect all ReferenceBlockModel references
    this.scanForTemplateRefs(flowModels);

    // Pass 2: Extract all templates (discovering nested ones as we go)
    await this.extractAllTemplates(modelMap);

    // ========================================================================
    // MAIN EXTRACTION PHASE: Now extract with all templates available
    // ========================================================================

    // Extract layout from grid settings (uses blockUidToId map)
    const layout = this.extractLayout(blockGrid, modelMap);

    // Extract blocks
    const blocks: Record<string, Block> = {};
    for (const blockModel of blockModels) {
      const blockId = this.blockUidToId.get(blockModel.uid)!;
      const block = await this.extractBlock(blockModel, modelMap);
      if (block) {
        blocks[blockId] = block;
      }
    }

    // Build collections map (reverse of collectionMap)
    const collections: Record<string, string> = {};
    for (const [internal, alias] of this.collectionMap) {
      collections[alias] = internal;
    }

    // Build templates map from extracted references
    const templateRecords: Record<string, TemplateDefinition> = {};
    for (const [key, def] of this.templates) {
      templateRecords[key] = def;
    }

    return {
      page: {
        title: resolved.title,
        route: path,
        icon: undefined, // TODO: extract from route if available
      },
      collections: Object.keys(collections).length > 0 ? collections : undefined,
      templates: Object.keys(templateRecords).length > 0 ? templateRecords : undefined,
      layout,
      blocks,
    };
  }

  /**
   * Extract layout from BlockGridModel's gridSettings
   * NOTE: This method must be called AFTER pre-generating block IDs (blockUidToId map)
   */
  private extractLayout(blockGrid: FlowModel, _modelMap: Map<string, FlowModel>): Layout {
    const gridSettings = (blockGrid.stepParams as any)?.gridSettings as GridSettings | undefined;

    if (!gridSettings?.grid) {
      // Default single-column layout if no grid settings
      return { rows: [{ columns: [{ width: 24, blocks: [] }] }] };
    }

    const { rows: gridRows, sizes, rowOrder } = gridSettings.grid;
    const rows: Row[] = [];

    for (const rowId of rowOrder || []) {
      const rowColumns = gridRows[rowId] || [];
      const rowSizes = sizes[rowId] || [];

      const columns: Column[] = [];
      for (let i = 0; i < rowColumns.length; i++) {
        const columnBlocks = rowColumns[i] || [];
        const width = rowSizes[i] || 24;

        // Map block UIDs to block IDs using pre-generated map
        const blockIds = columnBlocks
          .map(uid => this.blockUidToId.get(uid))
          .filter((id): id is string => id !== undefined);

        columns.push({ width, blocks: blockIds });
      }

      if (columns.length > 0) {
        rows.push({ columns });
      }
    }

    return { rows: rows.length > 0 ? rows : [{ columns: [{ width: 24, blocks: [] }] }] };
  }

  /**
   * Generate a unique block ID from the flowModel
   * Uses counters to ensure uniqueness when multiple blocks have the same base ID
   */
  private generateBlockId(model: FlowModel): string {
    // For charts, get collection from chartSettings.configure.query.collectionPath
    let collectionName = this.extractCollectionName(model);
    if (!collectionName && model.use === 'ChartBlockModel') {
      collectionName = this.extractChartCollectionName(model);
    }

    const alias = collectionName ? this.getCollectionAlias(collectionName) : 'block';
    const typePrefix = this.getBlockTypePrefix(model.use);
    const baseId = `${alias}_${typePrefix}`;

    // Use counter to generate unique IDs
    const count = (this.blockIdCounters.get(baseId) || 0) + 1;
    this.blockIdCounters.set(baseId, count);

    // First occurrence doesn't get a number suffix
    return count === 1 ? baseId : `${baseId}${count}`;
  }

  /**
   * Extract collection name from chart's query settings
   */
  private extractChartCollectionName(model: FlowModel): string | undefined {
    const stepParams = model.stepParams as any;
    const collectionPath = stepParams?.chartSettings?.configure?.query?.collectionPath;
    return collectionPath?.[1];
  }

  /**
   * Get a short prefix for block type
   */
  private getBlockTypePrefix(use: string): string {
    const prefixes: Record<string, string> = {
      TableBlockModel: 'table',
      ChartBlockModel: 'chart',
      DetailsBlockModel: 'details',
      FormBlockModel: 'form',
      MarkdownBlockModel: 'markdown',
    };
    return prefixes[use] || 'block';
  }

  /**
   * Get or create an alias for a collection name
   */
  private getCollectionAlias(collectionName: string): string {
    // Check if we already have an alias for this collection
    if (this.collectionMap.has(collectionName)) {
      return this.collectionMap.get(collectionName)!;
    }

    // Generate alias from collection name
    // t_xxx format → try to extract a meaningful name, otherwise use a generic one
    let alias = collectionName;
    if (collectionName.startsWith('t_')) {
      // Use a simple counter-based alias
      const count = this.collectionMap.size + 1;
      alias = `collection${count}`;
    }

    this.collectionMap.set(collectionName, alias);
    return alias;
  }

  /**
   * Extract collection name from a flowModel's stepParams
   */
  private extractCollectionName(model: FlowModel): string | undefined {
    const stepParams = model.stepParams as any;
    return stepParams?.resourceSettings?.init?.collectionName;
  }

  /**
   * Extract a block configuration from a flowModel
   */
  private async extractBlock(model: FlowModel, modelMap: Map<string, FlowModel>): Promise<Block | null> {
    switch (model.use) {
      case 'TableBlockModel':
        return this.extractTableBlock(model, modelMap);
      case 'ChartBlockModel':
        return this.extractChartBlock(model);
      case 'DetailsBlockModel':
        return this.extractDetailsBlock(model, modelMap);
      case 'FormBlockModel':
        return this.extractFormBlock(model, modelMap);
      case 'MarkdownBlockModel':
        return this.extractMarkdownBlock(model);
      default:
        console.warn(`Unknown block type: ${model.use}`);
        return null;
    }
  }

  /**
   * Extract TableBlock configuration
   */
  private async extractTableBlock(model: FlowModel, modelMap: Map<string, FlowModel>): Promise<TableBlock> {
    const stepParams = model.stepParams as any;
    const collectionName = this.extractCollectionName(model) || '';
    const alias = this.getCollectionAlias(collectionName);

    // Extract columns from subModels
    const columns: (string | ColumnConfig)[] = [];
    const columnModels = this.getSubModels(model, 'columns', modelMap);

    for (const col of columnModels) {
      if (col.use === 'TableActionsColumnModel') continue; // Skip actions column

      const config = await this.extractColumnConfig(col, modelMap);
      if (config) {
        columns.push(config);
      }
    }

    // Extract toolbar actions
    const toolbar: ToolbarAction[] = [];
    const actionModels = this.getSubModels(model, 'actions', modelMap);

    for (const action of actionModels) {
      const toolbarAction = this.extractToolbarAction(action);
      if (toolbarAction) {
        toolbar.push(toolbarAction);
      }
    }

    // Extract row actions (from TableActionsColumnModel)
    const rowActions: RowAction[] = [];
    const actionsColumn = columnModels.find(c => c.use === 'TableActionsColumnModel');

    if (actionsColumn) {
      const rowActionModels = this.getSubModels(actionsColumn, 'actions', modelMap);
      for (const action of rowActionModels) {
        const rowAction = await this.extractRowAction(action, modelMap);
        if (rowAction) {
          rowActions.push(rowAction);
        }
      }
    }

    // Extract table settings
    const tableSettings = stepParams?.tableSettings?.init || {};

    const block: TableBlock = {
      type: 'table',
      collection: alias,
      columns,
    };

    // Add optional settings
    if (toolbar.length > 0 || rowActions.length > 0) {
      block.actions = {};
      if (toolbar.length > 0) block.actions.toolbar = toolbar;
      if (rowActions.length > 0) block.actions.row = rowActions;
    }

    if (tableSettings.pageSize) {
      block.pageSize = tableSettings.pageSize;
    }

    if (tableSettings.defaultSort?.[0]) {
      block.defaultSort = {
        field: tableSettings.defaultSort[0].field,
        order: tableSettings.defaultSort[0].order,
      };
    }

    const quickEdit = stepParams?.tableSettings?.quickEdit;
    if (quickEdit?.editable !== undefined) {
      block.quickEdit = quickEdit.editable;
    }

    return block;
  }

  /**
   * Extract column configuration
   */
  private async extractColumnConfig(
    model: FlowModel,
    modelMap: Map<string, FlowModel>
  ): Promise<string | ColumnConfig | null> {
    const stepParams = model.stepParams as any;
    const fieldPath = stepParams?.fieldSettings?.init?.fieldPath;

    if (!fieldPath) return null;

    const tableColumnSettings = stepParams?.tableColumnSettings || {};
    const displayModel = tableColumnSettings?.model?.use;

    // Check if we need a full config object
    const width = tableColumnSettings?.width?.width;
    const sortable = tableColumnSettings?.sorter?.sorter;
    const fixed = tableColumnSettings?.fixed?.fixed;
    const displayType = this.mapModelToDisplayType(displayModel);

    // Check for relation field popup (DisplayTextFieldModel → ChildPageModel)
    const fieldModel = this.getSubModel(model, 'field', modelMap);
    let popup: Popup | undefined;
    if (fieldModel) {
      const pageModel = this.getSubModel(fieldModel, 'page', modelMap);
      if (pageModel) {
        popup = await this.extractPopup(fieldModel, modelMap) || undefined;
      }
    }

    // If only field name needed and no popup, return string
    if (!displayType && !width && sortable === undefined && !fixed && !popup) {
      return fieldPath;
    }

    // Return full config
    const config: ColumnConfig = { field: fieldPath };
    if (displayType) config.displayType = displayType;
    if (width) config.width = width;
    if (sortable !== undefined) config.sortable = sortable;
    if (fixed) config.fixed = fixed;
    if (popup) config.popup = popup;

    return config;
  }

  /**
   * Map display model to displayType
   */
  private mapModelToDisplayType(model: string | undefined): DisplayType | undefined {
    if (!model) return undefined;

    const map: Record<string, DisplayType> = {
      DisplayTextFieldModel: 'text',
      DisplayCheckboxFieldModel: 'checkbox',
      DisplayDateFieldModel: 'date',
      DisplayNumberFieldModel: 'number',
      DisplaySelectFieldModel: 'select',
      DisplayTagFieldModel: 'tag',
      DisplayLinkFieldModel: 'link',
      DisplayImageFieldModel: 'image',
    };

    // Don't include 'text' as it's the default
    const result = map[model];
    return result === 'text' ? undefined : result;
  }

  /**
   * Extract toolbar action
   */
  private extractToolbarAction(model: FlowModel): ToolbarAction | null {
    const map: Record<string, ToolbarAction> = {
      FilterActionModel: 'filter',
      CreateActionModel: 'create',
      RefreshActionModel: 'refresh',
      ExportActionModel: 'export',
    };
    return map[model.use] || null;
  }

  /**
   * Extract row action
   */
  private async extractRowAction(model: FlowModel, modelMap: Map<string, FlowModel>): Promise<RowAction | null> {
    if (model.use === 'DeleteActionModel') {
      return 'delete';
    }

    if (model.use === 'ViewActionModel' || model.use === 'EditActionModel') {
      const popup = await this.extractPopup(model, modelMap);
      if (popup) {
        return {
          type: model.use === 'ViewActionModel' ? 'view' : 'edit',
          popup,
        };
      }
    }

    return null;
  }

  /**
   * Extract popup configuration from an action
   */
  private async extractPopup(actionModel: FlowModel, modelMap: Map<string, FlowModel>): Promise<Popup | null> {
    // Find ChildPageModel in subModels
    const pageModel = this.getSubModel(actionModel, 'page', modelMap);
    if (!pageModel) return null;

    // Extract tabs
    const tabModels = this.getSubModels(pageModel, 'tabs', modelMap);
    const tabs: Tab[] = [];

    for (const tabModel of tabModels) {
      const tab = await this.extractTab(tabModel, modelMap);
      if (tab) {
        tabs.push(tab);
      }
    }

    if (tabs.length === 0) return null;

    const stepParams = pageModel.stepParams as any;
    // Correct path: pageSettings.general.displayTitle (not childPageSettings.title.displayTitle)
    const displayTitle = stepParams?.pageSettings?.general?.displayTitle;

    return {
      displayTitle: displayTitle !== undefined ? displayTitle : undefined,
      tabs,
    };
  }

  /**
   * Extract tab configuration
   */
  private async extractTab(tabModel: FlowModel, modelMap: Map<string, FlowModel>): Promise<Tab | null> {
    const stepParams = tabModel.stepParams as any;
    // Correct path: pageTabSettings.tab.title (not tabSettings.title.title)
    const title = stepParams?.pageTabSettings?.tab?.title || 'Tab';

    // Tab structure: tab → grid (BlockGridModel) → items (blocks)
    const gridModel = this.getSubModel(tabModel, 'grid', modelMap);
    if (!gridModel) return { title, blocks: [] };

    // Extract blocks from grid's items
    const blockModels = this.getSubModels(gridModel, 'items', modelMap);

    // Find UIDs that are targets of ReferenceBlockModels in this grid.
    // When NocoBase uses a template reference, the grid may contain BOTH the
    // ReferenceBlockModel AND the resolved target block. We should only extract
    // via the reference to avoid duplicates.
    const referencedUids = new Set<string>();
    for (const model of blockModels) {
      if (model.use === 'ReferenceBlockModel') {
        const targetUid = (model.stepParams as any)?.referenceSettings?.target?.targetUid;
        if (targetUid) {
          referencedUids.add(targetUid);
        }
      }
    }

    const blocks: InlineBlock[] = [];

    for (const blockModel of blockModels) {
      // Skip blocks that are referenced by a ReferenceBlockModel - they'll be extracted via the reference
      if (referencedUids.has(blockModel.uid)) {
        continue;
      }

      const block = await this.extractInlineBlock(blockModel, modelMap);
      if (block) {
        blocks.push(block);
      }
    }

    return { title, blocks };
  }

  /**
   * Extract inline block for popups
   */
  private async extractInlineBlock(model: FlowModel, modelMap: Map<string, FlowModel>): Promise<InlineBlock | null> {
    switch (model.use) {
      case 'DetailsBlockModel':
        return this.extractDetailsBlockInline(model, modelMap);
      case 'FormBlockModel':
      case 'EditFormModel':
        return this.extractFormBlockInline(model, modelMap);
      case 'MarkdownBlockModel':
        return this.extractMarkdownBlockInline(model);
      case 'ReferenceBlockModel':
        return this.extractReferenceBlock(model, modelMap);
      default:
        return null;
    }
  }

  /**
   * Extract ReferenceBlockModel as a template reference
   * Templates are pre-extracted during the scan phase, so we just look up the key
   */
  private async extractReferenceBlock(model: FlowModel, _modelMap: Map<string, FlowModel>): Promise<InlineBlock | null> {
    const stepParams = model.stepParams as any;
    const templateUid = stepParams?.referenceSettings?.useTemplate?.templateUid;
    const resourceSettings = stepParams?.resourceSettings?.init || {};
    const collectionName = resourceSettings.collectionName;
    const associationName = resourceSettings.associationName;

    if (!templateUid) {
      console.warn('[Exporter] ReferenceBlockModel missing templateUid:', model.uid);
      return null;
    }

    // Look up the pre-extracted template key
    const templateKey = this.templateUidToKey.get(templateUid);
    if (!templateKey) {
      console.warn('[Exporter] Template not found in pre-scan:', templateUid);
      return null;
    }

    // Build the reference block
    const referenceBlock: ReferenceBlockInline = {
      type: 'reference',
      template: templateKey,
    };

    // Add collection if specified
    if (collectionName) {
      const alias = this.getCollectionAlias(collectionName);
      referenceBlock.collection = alias;
    }

    // Add association if present
    if (associationName) {
      referenceBlock.association = associationName;
    }

    return referenceBlock;
  }

  /**
   * Generate a unique template key from the template name
   */
  private generateTemplateKey(templateName: string): string {
    // Convert to snake_case key (e.g., "Details: WorkStation" → "details_workstation")
    const baseKey = templateName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    // Use counter to ensure uniqueness
    const count = (this.templateKeyCounters.get(baseKey) || 0) + 1;
    this.templateKeyCounters.set(baseKey, count);

    return count === 1 ? baseKey : `${baseKey}_${count}`;
  }

  // ============================================================================
  // PRE-SCAN: Collect all template references before extraction
  // ============================================================================

  /**
   * Scan all flowModels and collect ReferenceBlockModel references
   */
  private scanForTemplateRefs(flowModels: FlowModel[]): void {
    console.log(`[Exporter] Scanning ${flowModels.length} flowModels for template refs...`);
    for (const model of flowModels) {
      this.scanModelForTemplateRefs(model);
    }
    console.log(`[Exporter] Found ${this.pendingTemplates.size} template references in initial scan`);
  }

  /**
   * Recursively scan a model and its subModels for ReferenceBlockModel
   */
  private scanModelForTemplateRefs(model: FlowModel): void {
    if (model.use === 'ReferenceBlockModel') {
      const stepParams = model.stepParams as any;
      const templateUid = stepParams?.referenceSettings?.useTemplate?.templateUid;
      const templateName = stepParams?.referenceSettings?.useTemplate?.templateName;
      const targetUid = stepParams?.referenceSettings?.target?.targetUid;

      if (templateUid && targetUid && !this.pendingTemplates.has(templateUid)) {
        this.pendingTemplates.set(templateUid, {
          templateUid,
          templateName: templateName || 'Template',
          targetUid,
        });
      }
    }

    // Recursively scan subModels
    if (model.subModels) {
      for (const value of Object.values(model.subModels)) {
        if (Array.isArray(value)) {
          for (const subModel of value) {
            this.scanModelForTemplateRefs(subModel);
          }
        } else if (value && typeof value === 'object' && 'uid' in value) {
          this.scanModelForTemplateRefs(value);
        }
      }
    }
  }

  /**
   * Extract all pending templates, discovering nested ones as we go
   */
  private async extractAllTemplates(modelMap: Map<string, FlowModel>): Promise<void> {
    let iteration = 0;
    // Process templates until no more pending
    while (this.pendingTemplates.size > 0) {
      iteration++;
      console.log(`[Exporter] Template extraction iteration ${iteration}, pending: ${this.pendingTemplates.size}`);

      // Get one template to process
      const [templateUid, ref] = this.pendingTemplates.entries().next().value;
      this.pendingTemplates.delete(templateUid);

      // Skip if already processed
      if (this.templateUidToKey.has(templateUid)) {
        console.log(`[Exporter] Skipping already processed template: ${ref.templateName}`);
        continue;
      }

      console.log(`[Exporter] Extracting template: ${ref.templateName} (uid: ${templateUid}, targetUid: ${ref.targetUid})`);

      // Generate key for this template
      const templateKey = this.generateTemplateKey(ref.templateName);
      this.templateUidToKey.set(templateUid, templateKey);

      // Fetch and extract the template content
      const templateDef = await this.extractTemplateDefinitionWithDiscovery(
        ref.targetUid,
        ref.templateName,
        modelMap
      );

      if (templateDef) {
        this.templates.set(templateKey, templateDef);
        console.log(`[Exporter] Successfully extracted template: ${templateKey}`);
      } else {
        console.warn(`[Exporter] Failed to extract template: ${ref.templateName} (targetUid: ${ref.targetUid})`);
      }
    }

    console.log(`[Exporter] Template extraction complete. Total templates: ${this.templates.size}`);
  }

  /**
   * Extract a template definition and discover any nested template references
   */
  private async extractTemplateDefinitionWithDiscovery(
    targetUid: string,
    templateName: string,
    modelMap: Map<string, FlowModel>
  ): Promise<TemplateDefinition | null> {
    console.log(`[Exporter] extractTemplateDefinitionWithDiscovery: ${templateName}, targetUid: ${targetUid}`);

    // Fetch the target block
    let targetModel = modelMap.get(targetUid);
    console.log(`[Exporter] Target model in modelMap: ${!!targetModel}`);

    if (!targetModel) {
      console.log(`[Exporter] Fetching target model from DB: ${targetUid}`);
      targetModel = await this.fetchFlowModelWithSubModels(targetUid);
      if (!targetModel) {
        console.warn('[Exporter] Template target not found in DB:', targetUid);
        return null;
      }

      console.log(`[Exporter] Fetched model use: ${targetModel.use}, has subModels: ${!!targetModel.subModels}`);

      // Add to modelMap for extraction
      modelMap.set(targetModel.uid, targetModel);
      this.addSubModelsToMap(targetModel, modelMap);

      // IMPORTANT: Scan this newly fetched model for nested template refs
      this.scanModelForTemplateRefs(targetModel);
      console.log(`[Exporter] After scanning, pending templates: ${this.pendingTemplates.size}`);
    }

    console.log(`[Exporter] Target model type: ${targetModel.use}`);

    // Extract based on type
    if (targetModel.use === 'DetailsBlockModel') {
      const block = await this.extractDetailsBlock(targetModel, modelMap);
      return {
        name: templateName,
        type: 'details',
        collection: block.collection,
        fields: block.fields,
        actions: block.actions,
      };
    }

    if (targetModel.use === 'FormBlockModel' || targetModel.use === 'EditFormModel') {
      const block = await this.extractFormBlock(targetModel, modelMap);
      return {
        name: templateName,
        type: 'form',
        collection: block.collection,
        fields: block.fields,
        actions: block.actions,
      };
    }

    console.warn('[Exporter] Unknown template block type:', targetModel.use);
    return null;
  }

  /**
   * Fetch a flowModel with its nested subModels from database
   * Uses the closure table to get all descendants and builds the tree structure
   */
  private async fetchFlowModelWithSubModels(uid: string): Promise<FlowModel | null> {
    const flowModelRepo = this.db.getRepository('flowModels') as any;

    // Try using the repository's toFlowModelJSON method if available
    const modelRaw = await flowModelRepo.findOne({ filter: { uid } });
    console.log(`[Exporter] fetchFlowModelWithSubModels(${uid}): found=${!!modelRaw}`);
    if (!modelRaw) return null;

    // Check if repository has toFlowModelJSON (builds nested structure)
    if (typeof flowModelRepo.toFlowModelJSON === 'function') {
      const result = await flowModelRepo.toFlowModelJSON(modelRaw);
      console.log(`[Exporter] toFlowModelJSON result: uid=${result?.uid}, use=${result?.use}, hasSubModels=${!!result?.subModels}`);
      return result;
    }

    // Fallback: fetch all descendants via closure table and build tree manually
    console.log(`[Exporter] Fetching descendants via closure table for: ${uid}`);
    const descendants = await this.fetchDescendants(uid);
    console.log(`[Exporter] Found ${descendants.length} descendants`);

    if (descendants.length === 0) {
      // No descendants, just return the root
      const plainModel = modelRaw.toJSON ? modelRaw.toJSON() : modelRaw;
      return plainModel as FlowModel;
    }

    // Build the tree structure from flat list
    return await this.buildTreeFromDescendants(uid, descendants);
  }

  /**
   * Fetch all descendants of a model using the closure table
   */
  private async fetchDescendants(rootUid: string): Promise<FlowModel[]> {
    // Query the closure table to get all descendant UIDs
    const treePathRepo = this.db.getRepository('flowModelTreePath');
    const paths = await treePathRepo.find({
      filter: { ancestor: rootUid },
    });

    const descendantUids = paths
      .map((p: any) => p.descendant || p.get?.('descendant'))
      .filter((uid: string) => uid && uid !== rootUid);

    if (descendantUids.length === 0) return [];

    // Fetch all descendant models
    const flowModelRepo = this.db.getRepository('flowModels');
    const models = await flowModelRepo.find({
      filter: { uid: { $in: descendantUids } },
    });

    // Convert to plain objects
    return models.map((m: any) => (m.toJSON ? m.toJSON() : m) as FlowModel);
  }

  /**
   * Build a tree structure from flat descendant list
   */
  private async buildTreeFromDescendants(rootUid: string, descendants: FlowModel[]): Promise<FlowModel | null> {
    // Create a map of all models
    const modelMap = new Map<string, FlowModel>();

    // First add all descendants to map
    for (const model of descendants) {
      modelMap.set(model.uid, { ...model, subModels: {} });
    }

    // Fetch the root model if not in descendants
    let root = modelMap.get(rootUid);
    if (!root) {
      const flowModelRepo = this.db.getRepository('flowModels');
      const rootModelRaw = await flowModelRepo.findOne({ filter: { uid: rootUid } });
      if (!rootModelRaw) {
        console.warn(`[Exporter] Root ${rootUid} not found in database`);
        return null;
      }
      const rootPlain = (rootModelRaw as any).toJSON ? (rootModelRaw as any).toJSON() : rootModelRaw;
      root = { ...rootPlain, subModels: {} } as FlowModel;
      modelMap.set(rootUid, root);
    }

    // Now build the tree by linking children to parents
    for (const model of modelMap.values()) {
      if (model.parentId && model.parentId !== rootUid) {
        const parent = modelMap.get(model.parentId);
        if (parent && model.subKey) {
          if (!parent.subModels) parent.subModels = {};

          if (model.subType === 'array') {
            if (!parent.subModels[model.subKey]) {
              parent.subModels[model.subKey] = [];
            }
            (parent.subModels[model.subKey] as FlowModel[]).push(model);
          } else {
            parent.subModels[model.subKey] = model;
          }
        }
      } else if (model.parentId === rootUid && model.subKey) {
        // Direct child of root
        if (!root.subModels) root.subModels = {};

        if (model.subType === 'array') {
          if (!root.subModels[model.subKey]) {
            root.subModels[model.subKey] = [];
          }
          (root.subModels[model.subKey] as FlowModel[]).push(model);
        } else {
          root.subModels[model.subKey] = model;
        }
      }
    }

    // Sort arrays by sortIndex
    const sortArrays = (obj: FlowModel) => {
      if (obj.subModels) {
        for (const key of Object.keys(obj.subModels)) {
          const value = obj.subModels[key];
          if (Array.isArray(value)) {
            value.sort((a, b) => (a.sortIndex || 0) - (b.sortIndex || 0));
            value.forEach(sortArrays);
          } else if (value && typeof value === 'object') {
            sortArrays(value);
          }
        }
      }
    };
    sortArrays(root);

    console.log(`[Exporter] Built tree for ${rootUid}, subModels keys: ${Object.keys(root.subModels || {}).join(', ')}`);
    return root;
  }

  /**
   * Recursively add subModels to the map for lookup
   */
  private addSubModelsToMap(model: FlowModel, modelMap: Map<string, FlowModel>): void {
    if (!model.subModels) return;

    for (const [_key, value] of Object.entries(model.subModels)) {
      if (Array.isArray(value)) {
        for (const subModel of value) {
          modelMap.set(subModel.uid, subModel);
          this.addSubModelsToMap(subModel, modelMap);
        }
      } else if (value && typeof value === 'object' && 'uid' in value) {
        modelMap.set(value.uid, value);
        this.addSubModelsToMap(value, modelMap);
      }
    }
  }

  /**
   * Extract ChartBlock configuration
   */
  private extractChartBlock(model: FlowModel): ChartBlock {
    const stepParams = model.stepParams as any;
    const chartSettings = stepParams?.chartSettings?.configure || {};
    const query = chartSettings?.query || {};
    const chart = chartSettings?.chart?.option?.builder || {};

    // Chart collection is in collectionPath[1], not resourceSettings
    const collectionPath = query.collectionPath || [];
    const collectionName = collectionPath[1] || '';
    const alias = collectionName ? this.getCollectionAlias(collectionName) : '';

    // Extract dimension and measure
    const dimension = query.dimensions?.[0]?.field?.[0] || '';
    const measureConfig = query.measures?.[0] || {};
    const measureField = measureConfig.field?.[0] || 'id';
    const aggregation = measureConfig.aggregation || 'count';

    return {
      type: 'chart',
      collection: alias,
      chartType: chart.type || 'bar',
      dimension,
      measure: { field: measureField, aggregation },
      options: {
        legend: chart.legend,
        tooltip: chart.tooltip,
      },
    };
  }

  /**
   * Extract DetailsBlock configuration
   */
  private async extractDetailsBlock(model: FlowModel, modelMap: Map<string, FlowModel>): Promise<DetailsBlock> {
    const collectionName = this.extractCollectionName(model) || '';
    const alias = this.getCollectionAlias(collectionName);

    // Extract fields from grid/items
    const fields = await this.extractDetailFields(model, modelMap);

    // Extract actions
    const actions = await this.extractBlockActions(model, modelMap);

    const block: DetailsBlock = {
      type: 'details',
      collection: alias,
      fields,
    };

    if (actions.length > 0) {
      block.actions = actions;
    }

    return block;
  }

  /**
   * Extract details block inline (for popups)
   */
  private async extractDetailsBlockInline(model: FlowModel, modelMap: Map<string, FlowModel>): Promise<InlineBlock> {
    const block = await this.extractDetailsBlock(model, modelMap);
    return {
      type: 'details',
      collection: block.collection,
      fields: block.fields,
      actions: block.actions,
    };
  }

  /**
   * Extract detail fields from DetailsBlockModel
   */
  private async extractDetailFields(model: FlowModel, modelMap: Map<string, FlowModel>): Promise<(string | FieldConfig)[]> {
    const fields: (string | FieldConfig)[] = [];

    // Find DetailsGridModel
    const gridModel = this.getSubModel(model, 'grid', modelMap);
    if (!gridModel) return fields;

    // Get items (DetailsItemModel)
    const itemModels = this.getSubModels(gridModel, 'items', modelMap);

    for (const item of itemModels) {
      const stepParams = item.stepParams as any;
      const fieldPath = stepParams?.fieldSettings?.init?.fieldPath;
      const span = stepParams?.detailsItemSettings?.span?.span;

      if (!fieldPath) continue;

      // Check for relation field popup (DetailsItemModel → field → page)
      const fieldModel = this.getSubModel(item, 'field', modelMap);
      let popup: Popup | undefined;
      if (fieldModel) {
        const pageModel = this.getSubModel(fieldModel, 'page', modelMap);
        if (pageModel) {
          popup = await this.extractPopup(fieldModel, modelMap) || undefined;
        }
      }

      // Determine if we need a full config object
      const needsConfig = (span && span !== 24) || popup;

      if (needsConfig) {
        const config: FieldConfig = { field: fieldPath };
        if (span && span !== 24) config.span = span;
        if (popup) config.popup = popup;
        fields.push(config);
      } else {
        fields.push(fieldPath);
      }
    }

    return fields;
  }

  /**
   * Extract FormBlock configuration
   */
  private async extractFormBlock(model: FlowModel, modelMap: Map<string, FlowModel>): Promise<FormBlock> {
    const collectionName = this.extractCollectionName(model) || '';
    const alias = this.getCollectionAlias(collectionName);

    // Extract fields from items
    const fields = this.extractFormFields(model, modelMap);

    // Extract actions
    const actions = await this.extractBlockActions(model, modelMap);

    const block: FormBlock = {
      type: 'form',
      collection: alias,
      fields,
    };

    if (actions.length > 0) {
      block.actions = actions;
    }

    return block;
  }

  /**
   * Extract form block inline (for popups)
   */
  private async extractFormBlockInline(model: FlowModel, modelMap: Map<string, FlowModel>): Promise<InlineBlock> {
    const block = await this.extractFormBlock(model, modelMap);
    return {
      type: 'form',
      collection: block.collection,
      fields: block.fields,
      actions: block.actions,
    };
  }

  /**
   * Extract form fields from FormBlockModel or EditFormModel
   */
  private extractFormFields(model: FlowModel, modelMap: Map<string, FlowModel>): (string | FormFieldConfig)[] {
    const fields: (string | FormFieldConfig)[] = [];

    // EditFormModel uses grid → items, FormBlockModel uses direct items
    let itemModels = this.getSubModels(model, 'items', modelMap);

    // If no direct items, check for FormGridModel
    if (itemModels.length === 0) {
      const gridModel = this.getSubModel(model, 'grid', modelMap);
      if (gridModel) {
        itemModels = this.getSubModels(gridModel, 'items', modelMap);
      }
    }

    for (const item of itemModels) {
      const stepParams = item.stepParams as any;
      const fieldPath = stepParams?.fieldSettings?.init?.fieldPath;
      const required = stepParams?.formItemSettings?.required?.required;
      const placeholder = stepParams?.formItemSettings?.placeholder?.placeholder;

      if (!fieldPath) continue;

      if (required || placeholder) {
        const config: FormFieldConfig = { field: fieldPath };
        if (required) config.required = required;
        if (placeholder) config.placeholder = placeholder;
        fields.push(config);
      } else {
        fields.push(fieldPath);
      }
    }

    return fields;
  }

  /**
   * Extract block actions (edit, delete, or popup actions)
   */
  private async extractBlockActions(model: FlowModel, modelMap: Map<string, FlowModel>): Promise<BlockAction[]> {
    const actions: BlockAction[] = [];
    const actionModels = this.getSubModels(model, 'actions', modelMap);

    for (const action of actionModels) {
      if (action.use === 'DeleteActionModel') {
        actions.push('delete');
      } else if (action.use === 'EditActionModel' || action.use === 'ViewActionModel') {
        // Check if action has a popup
        const popup = await this.extractPopup(action, modelMap);
        if (popup) {
          actions.push({
            type: action.use === 'ViewActionModel' ? 'view' : 'edit',
            popup,
          });
        } else {
          // Simple action without popup
          actions.push(action.use === 'EditActionModel' ? 'edit' : 'delete');
        }
      }
    }

    return actions;
  }

  /**
   * Extract MarkdownBlock configuration
   */
  private extractMarkdownBlock(model: FlowModel): MarkdownBlock {
    const stepParams = model.stepParams as any;
    // Check both possible paths for markdown content
    const content =
      stepParams?.markdownBlockSettings?.editMarkdown?.content ||
      stepParams?.markdownSettings?.content?.content ||
      '';

    return {
      type: 'markdown',
      content,
    };
  }

  /**
   * Extract markdown block inline (for popups)
   */
  private extractMarkdownBlockInline(model: FlowModel): InlineBlock {
    const block = this.extractMarkdownBlock(model);
    return {
      type: 'markdown',
      content: block.content,
    };
  }

  /**
   * Get subModels array for a given key
   */
  private getSubModels(model: FlowModel, subKey: string, modelMap: Map<string, FlowModel>): FlowModel[] {
    // First check inline subModels
    const inline = model.subModels?.[subKey];
    if (inline) {
      const models = Array.isArray(inline) ? inline : [inline];
      // Sort inline subModels by sortIndex too
      return models.sort((a, b) => (a.sortIndex || 0) - (b.sortIndex || 0));
    }

    // Fall back to finding by parentId/subKey in modelMap
    const result: FlowModel[] = [];
    for (const [, m] of modelMap) {
      if (m.parentId === model.uid && m.subKey === subKey) {
        result.push(m);
      }
    }

    // Sort by sortIndex
    return result.sort((a, b) => (a.sortIndex || 0) - (b.sortIndex || 0));
  }

  /**
   * Get single subModel for a given key
   */
  private getSubModel(model: FlowModel, subKey: string, modelMap: Map<string, FlowModel>): FlowModel | null {
    const models = this.getSubModels(model, subKey, modelMap);
    return models[0] || null;
  }
}
