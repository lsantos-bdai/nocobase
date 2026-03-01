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
} from '../types';
import { RouteResolver } from './route-resolver';

export class Exporter {
  private routeResolver: RouteResolver;
  private collectionMap: Map<string, string> = new Map(); // t_xxx → alias
  private blockIdCounters: Map<string, number> = new Map(); // baseId → count
  private blockUidToId: Map<string, string> = new Map(); // uid → blockId

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
    for (const model of blockModels) {
      const blockId = this.generateBlockId(model);
      this.blockUidToId.set(model.uid, blockId);
    }

    // Extract layout from grid settings (uses blockUidToId map)
    const layout = this.extractLayout(blockGrid, modelMap);

    // Extract blocks
    const blocks: Record<string, Block> = {};
    for (const blockModel of blockModels) {
      const blockId = this.blockUidToId.get(blockModel.uid)!;
      const block = this.extractBlock(blockModel, modelMap);
      if (block) {
        blocks[blockId] = block;
      }
    }

    // Build collections map (reverse of collectionMap)
    const collections: Record<string, string> = {};
    for (const [internal, alias] of this.collectionMap) {
      collections[alias] = internal;
    }

    // Get route info
    const route = await this.routeResolver.resolveRouteByPath(path);

    return {
      page: {
        title: resolved.title,
        route: path,
        icon: undefined, // TODO: extract from route if available
      },
      collections: Object.keys(collections).length > 0 ? collections : undefined,
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
  private extractBlock(model: FlowModel, modelMap: Map<string, FlowModel>): Block | null {
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
  private extractTableBlock(model: FlowModel, modelMap: Map<string, FlowModel>): TableBlock {
    const stepParams = model.stepParams as any;
    const collectionName = this.extractCollectionName(model) || '';
    const alias = this.getCollectionAlias(collectionName);

    // Extract columns from subModels
    const columns: (string | ColumnConfig)[] = [];
    const columnModels = this.getSubModels(model, 'columns', modelMap);

    for (const col of columnModels) {
      if (col.use === 'TableActionsColumnModel') continue; // Skip actions column

      const config = this.extractColumnConfig(col);
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
        const rowAction = this.extractRowAction(action, modelMap);
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
  private extractColumnConfig(model: FlowModel): string | ColumnConfig | null {
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

    // If only field name needed, return string
    if (!displayType && !width && sortable === undefined && !fixed) {
      return fieldPath;
    }

    // Return full config
    const config: ColumnConfig = { field: fieldPath };
    if (displayType) config.displayType = displayType;
    if (width) config.width = width;
    if (sortable !== undefined) config.sortable = sortable;
    if (fixed) config.fixed = fixed;

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
  private extractRowAction(model: FlowModel, modelMap: Map<string, FlowModel>): RowAction | null {
    if (model.use === 'DeleteActionModel') {
      return 'delete';
    }

    if (model.use === 'ViewActionModel' || model.use === 'EditActionModel') {
      const popup = this.extractPopup(model, modelMap);
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
  private extractPopup(actionModel: FlowModel, modelMap: Map<string, FlowModel>): Popup | null {
    // Find ChildPageModel in subModels
    const pageModel = this.getSubModel(actionModel, 'page', modelMap);
    if (!pageModel) return null;

    // Extract tabs
    const tabModels = this.getSubModels(pageModel, 'tabs', modelMap);
    const tabs: Tab[] = [];

    for (const tabModel of tabModels) {
      const tab = this.extractTab(tabModel, modelMap);
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
  private extractTab(tabModel: FlowModel, modelMap: Map<string, FlowModel>): Tab | null {
    const stepParams = tabModel.stepParams as any;
    // Correct path: pageTabSettings.tab.title (not tabSettings.title.title)
    const title = stepParams?.pageTabSettings?.tab?.title || 'Tab';

    // Tab structure: tab → grid (BlockGridModel) → items (blocks)
    const gridModel = this.getSubModel(tabModel, 'grid', modelMap);
    if (!gridModel) return { title, blocks: [] };

    // Extract blocks from grid's items
    const blockModels = this.getSubModels(gridModel, 'items', modelMap);
    const blocks: InlineBlock[] = [];

    for (const blockModel of blockModels) {
      const block = this.extractInlineBlock(blockModel, modelMap);
      if (block) {
        blocks.push(block);
      }
    }

    return { title, blocks };
  }

  /**
   * Extract inline block for popups
   */
  private extractInlineBlock(model: FlowModel, modelMap: Map<string, FlowModel>): InlineBlock | null {
    switch (model.use) {
      case 'DetailsBlockModel':
        return this.extractDetailsBlockInline(model, modelMap);
      case 'FormBlockModel':
      case 'EditFormModel':
        return this.extractFormBlockInline(model, modelMap);
      case 'MarkdownBlockModel':
        return this.extractMarkdownBlockInline(model);
      default:
        return null;
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
  private extractDetailsBlock(model: FlowModel, modelMap: Map<string, FlowModel>): DetailsBlock {
    const collectionName = this.extractCollectionName(model) || '';
    const alias = this.getCollectionAlias(collectionName);

    // Extract fields from grid/items
    const fields = this.extractDetailFields(model, modelMap);

    // Extract actions
    const actions = this.extractBlockActions(model, modelMap);

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
  private extractDetailsBlockInline(model: FlowModel, modelMap: Map<string, FlowModel>): InlineBlock {
    const block = this.extractDetailsBlock(model, modelMap);
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
  private extractDetailFields(model: FlowModel, modelMap: Map<string, FlowModel>): (string | FieldConfig)[] {
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

      if (span && span !== 24) {
        fields.push({ field: fieldPath, span });
      } else {
        fields.push(fieldPath);
      }
    }

    return fields;
  }

  /**
   * Extract FormBlock configuration
   */
  private extractFormBlock(model: FlowModel, modelMap: Map<string, FlowModel>): FormBlock {
    const collectionName = this.extractCollectionName(model) || '';
    const alias = this.getCollectionAlias(collectionName);

    // Extract fields from items
    const fields = this.extractFormFields(model, modelMap);

    // Extract actions
    const actions = this.extractBlockActions(model, modelMap);

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
  private extractFormBlockInline(model: FlowModel, modelMap: Map<string, FlowModel>): InlineBlock {
    const block = this.extractFormBlock(model, modelMap);
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
   * Extract block actions (edit, delete, etc.)
   */
  private extractBlockActions(model: FlowModel, modelMap: Map<string, FlowModel>): BlockAction[] {
    const actions: BlockAction[] = [];
    const actionModels = this.getSubModels(model, 'actions', modelMap);

    for (const action of actionModels) {
      if (action.use === 'EditActionModel') {
        actions.push('edit');
      } else if (action.use === 'DeleteActionModel') {
        actions.push('delete');
      }
    }

    return actions;
  }

  /**
   * Extract MarkdownBlock configuration
   */
  private extractMarkdownBlock(model: FlowModel): MarkdownBlock {
    const stepParams = model.stepParams as any;
    const content = stepParams?.markdownSettings?.content?.content || '';

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
