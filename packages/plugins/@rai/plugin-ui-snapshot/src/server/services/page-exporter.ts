/**
 * Page Exporter Service
 *
 * Exports existing NocoBase UI pages to JSON configuration format.
 *
 * Uses NocoBase's flowModelTreePath closure table for reliable tree traversal
 * across all page types (regular pages, flowPages, tabs pages).
 */
import type { Database } from '@nocobase/database';
import type {
  PageConfig,
  LayoutConfig,
  LayoutRow,
  LayoutColumn,
  BlockConfig,
  TableBlockConfig,
  ChartBlockConfig,
  DetailsBlockConfig,
  FormBlockConfig,
  FlowModel,
  GridSettings,
  UISnapshotConfig,
} from '../types';
import { RouteResolver } from './route-resolver';

export class PageExporter {
  private routeResolver: RouteResolver;

  constructor(private db: Database) {
    this.routeResolver = new RouteResolver(db);
  }

  /**
   * Export a single page by its route path
   *
   * Uses the closure table (flowModelTreePath) to reliably get all
   * flowModels in the page's tree.
   */
  async exportByPath(path: string): Promise<PageConfig> {
    console.log(`[PageExporter] exportByPath called with path: "${path}"`);

    const resolved = await this.routeResolver.resolveByPath(path);
    console.log(`[PageExporter] resolveByPath result:`, resolved);

    if (!resolved) {
      console.log(`[PageExporter] Page not found, throwing error`);
      throw new Error(`Page not found at path: ${path}`);
    }

    console.log(`[PageExporter] Building page config for pageUid: ${resolved.pageUid}`);
    const config = await this.buildPageConfig(resolved.pageUid, resolved.title, path);
    console.log(`[PageExporter] Page config built successfully`);

    return config;
  }

  /**
   * Export all pages to a single snapshot object
   */
  async exportAllPages(): Promise<UISnapshotConfig> {
    const pages = await this.routeResolver.getAllPagePaths();
    const configs: PageConfig[] = [];
    const allCollections: Record<string, string> = {};

    for (const page of pages) {
      try {
        // Use routeResolver to get pageUid (it has the canonical resolution logic)
        const resolved = await this.routeResolver.resolveByPath(page.path);
        if (!resolved) continue;

        const config = await this.buildPageConfig(resolved.pageUid, page.path.split('/').pop() || '', page.path);

        // Merge collections
        if (config.collections) {
          Object.assign(allCollections, config.collections);
        }

        configs.push(config);
      } catch {
        // Skip pages that fail to export
      }
    }

    return {
      version: '1.0',
      exported_at: new Date().toISOString(),
      collections: allCollections,
      pages: configs.map((config) => ({ page: config })),
    };
  }

  /**
   * Get all flowModels in a page's tree.
   *
   * Delegates to RouteResolver which handles the JSON-based flowModel structure.
   */
  private async getFlowModelTree(rootUid: string): Promise<FlowModel[]> {
    console.log(`[PageExporter] getFlowModelTree called for rootUid: ${rootUid}`);
    return this.routeResolver.getFlowModelTree(rootUid);
  }

  /**
   * Build PageConfig from flowModels
   *
   * Uses the JSON-based flowModel structure.
   */
  private async buildPageConfig(pageUid: string, title: string, path: string): Promise<PageConfig> {
    console.log(`[PageExporter] buildPageConfig called for pageUid: ${pageUid}`);

    // Get all descendants of the page
    let descendants = await this.getFlowModelTree(pageUid);
    console.log(`[PageExporter] Got ${descendants.length} descendants from getFlowModelTree`);

    // Log the model types we found
    console.log(`[PageExporter] Model types found:`, descendants.map((m: any) => ({ uid: m.uid, use: m.use })));

    // If no descendants found, try direct children lookup (fallback)
    if (descendants.length === 0) {
      console.log(`[PageExporter] No descendants found, trying getDescendantsSimple`);
      descendants = await this.getDescendantsSimple(pageUid);
      console.log(`[PageExporter] Got ${descendants.length} descendants from getDescendantsSimple`);
    }

    // Find the BlockGridModel (could be in descendants or we need to search differently)
    let gridModel = descendants.find((m: any) => m.use === 'BlockGridModel');

    // If no BlockGridModel found, maybe the page structure is different
    // Try to find the root page model first
    if (!gridModel) {
      const rootPageModel = descendants.find((m: any) => m.use === 'RootPageModel');
      if (rootPageModel) {
        console.log(`[PageExporter] Found RootPageModel, looking for BlockGridModel in its children`);
        // Look for BlockGridModel in subModels
        if (rootPageModel.subModels?.grid) {
          gridModel = rootPageModel.subModels.grid;
        }
      }
    }

    if (!gridModel) {
      console.log(`[PageExporter] No BlockGridModel found. Available models:`, descendants);
      throw new Error('No BlockGridModel found in page');
    }

    console.log(`[PageExporter] Found BlockGridModel:`, gridModel.uid);

    // Parse grid settings to get layout
    const gridSettings = gridModel.stepParams?.gridSettings as GridSettings | undefined;
    console.log(`[PageExporter] Grid settings:`, JSON.stringify(gridSettings, null, 2));

    // Build collections mapping (find all unique collection references)
    const collections: Record<string, string> = {};
    const blocks: Record<string, BlockConfig> = {};

    // Find all block models - they could be:
    // 1. In the descendants array with parentId matching gridModel.uid (if we extracted them)
    // 2. In the gridModel.subModels.items array (if stored inline)
    let blockModels: any[] = [];

    // First, try to find blocks in descendants by parentId (if we extracted them with parent info)
    blockModels = descendants.filter(
      (m: any) =>
        m.parentId === gridModel.uid &&
        ['TableBlockModel', 'ChartBlockModel', 'DetailsBlockModel', 'FormBlockModel', 'MarkdownBlockModel'].includes(
          m.use
        )
    );

    // If no blocks found in descendants, try to get them from gridModel.subModels.items
    if (blockModels.length === 0 && gridModel.subModels?.items) {
      console.log(`[PageExporter] Looking for blocks in gridModel.subModels.items`);
      const items = Array.isArray(gridModel.subModels.items) ? gridModel.subModels.items : [gridModel.subModels.items];
      blockModels = items.filter((m: any) =>
        ['TableBlockModel', 'ChartBlockModel', 'DetailsBlockModel', 'FormBlockModel', 'MarkdownBlockModel'].includes(
          m.use
        )
      );
    }

    console.log(`[PageExporter] Found ${blockModels.length} block models:`, blockModels.map((m: any) => ({ uid: m.uid, use: m.use })));

    // Build block configs and track collections
    for (let i = 0; i < blockModels.length; i++) {
      const blockModel = blockModels[i];
      const blockName = `block_${i + 1}`;

      const blockConfig = this.buildBlockConfig(blockModel, descendants);
      if (blockConfig) {
        blocks[blockName] = blockConfig;

        // Track collection
        if ('collection' in blockConfig && blockConfig.collection) {
          const collName = blockConfig.collection;
          if (collName.startsWith('t_')) {
            // Create a friendly alias
            const alias = this.createCollectionAlias(collName, collections);
            collections[alias] = collName;
            blockConfig.collection = alias;
          }
        }
      }
    }

    // Build layout from grid settings
    const layout = this.buildLayoutFromGrid(gridSettings, blockModels);

    // Update block references in layout with proper names
    this.updateLayoutBlockRefs(layout, blockModels, blocks);

    return {
      page: {
        title,
        route: path,
      },
      collections: Object.keys(collections).length > 0 ? collections : undefined,
      layout,
      blocks,
    };
  }

  /**
   * Simple recursive descendant finder (fallback when getFlowModelTree returns empty)
   *
   * Uses RouteResolver's method which handles the JSON structure properly.
   */
  private async getDescendantsSimple(parentUid: string): Promise<any[]> {
    console.log(`[PageExporter] getDescendantsSimple called for parentUid: ${parentUid}`);
    // Delegate to RouteResolver which handles the actual JSON structure
    return this.routeResolver.getFlowModelTree(parentUid);
  }

  /**
   * Build a block config from a flowModel
   */
  private buildBlockConfig(model: any, descendants: any[]): BlockConfig | null {
    const stepParams = model.stepParams || {};

    switch (model.use) {
      case 'TableBlockModel':
        return this.buildTableConfig(model, descendants);
      case 'ChartBlockModel':
        return this.buildChartConfig(model);
      case 'DetailsBlockModel':
        return this.buildDetailsConfig(model, descendants);
      case 'FormBlockModel':
        return this.buildFormConfig(model, descendants);
      case 'MarkdownBlockModel':
        return {
          type: 'MarkdownBlockModel',
          content: stepParams.markdownSettings?.init?.content || '',
        } as any;
      default:
        return null;
    }
  }

  /**
   * Build TableBlockConfig from flowModel
   */
  private buildTableConfig(model: any, descendants: any[]): TableBlockConfig {
    const stepParams = model.stepParams || {};
    const collectionName = stepParams.resourceSettings?.init?.collectionName || '';

    // Find columns - check both descendants and inline subModels
    // Include both TableColumnModel and TableActionsColumnModel
    let columnModels = descendants.filter(
      (m: any) => m.parentId === model.uid && (m.use === 'TableColumnModel' || m.use === 'TableActionsColumnModel')
    );
    if (columnModels.length === 0 && model.subModels?.columns) {
      const cols = Array.isArray(model.subModels.columns) ? model.subModels.columns : [model.subModels.columns];
      columnModels = cols.filter((m: any) => m.use === 'TableColumnModel' || m.use === 'TableActionsColumnModel');
    }

    // Sort columns by sortIndex to preserve order
    columnModels.sort((a: any, b: any) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));

    // Separate regular columns from actions column
    const regularColumnModels = columnModels.filter((m: any) => m.use === 'TableColumnModel');
    const actionsColumnModel = columnModels.find((m: any) => m.use === 'TableActionsColumnModel');

    const columns = regularColumnModels.map((col: any, index: number) => {
      const colStepParams = col.stepParams || {};
      const tableColumnSettings = colStepParams.tableColumnSettings || {};

      return {
        field: colStepParams.fieldSettings?.init?.fieldPath || '',
        // Fix: sortable is at tableColumnSettings.sorter.sorter, not columnSettings.init.sortable
        sortable: tableColumnSettings.sorter?.sorter,
        width: tableColumnSettings.width?.width,
        fixed: tableColumnSettings.fixed?.fixed,
        // Add displayType from tableColumnSettings.model.use
        displayType: this.mapDisplayModelToType(tableColumnSettings.model?.use),
        // Preserve column order
        sortIndex: col.sortIndex ?? index,
      };
    });

    // Find toolbar actions - check both descendants and inline subModels
    let toolbarActionModels = descendants.filter(
      (m: any) =>
        m.parentId === model.uid &&
        ['FilterActionModel', 'CreateActionModel', 'RefreshActionModel', 'ExportActionModel'].includes(m.use)
    );
    if (toolbarActionModels.length === 0 && model.subModels?.actions) {
      const acts = Array.isArray(model.subModels.actions) ? model.subModels.actions : [model.subModels.actions];
      toolbarActionModels = acts.filter((m: any) =>
        ['FilterActionModel', 'CreateActionModel', 'RefreshActionModel', 'ExportActionModel'].includes(m.use)
      );
    }

    const toolbarActions = toolbarActionModels.map((action: any) => ({
      type: this.mapActionModelToType(action.use),
    }));

    // Extract row actions from TableActionsColumnModel
    const rowActions = this.extractRowActions(actionsColumnModel, descendants);

    // Extract quickEdit setting from tableSettings
    const quickEdit = stepParams.tableSettings?.quickEdit?.editable;

    return {
      type: 'TableBlockModel',
      collection: collectionName,
      columns: columns.filter((c: any) => c.field),
      toolbarActions: toolbarActions.length > 0 ? toolbarActions : undefined,
      rowActions: rowActions.length > 0 ? rowActions : undefined,
      pageSize: stepParams.tableSettings?.init?.pageSize,
      quickEdit,
    };
  }

  /**
   * Extract row actions from TableActionsColumnModel
   */
  private extractRowActions(actionsColumnModel: any, descendants: any[]): any[] {
    if (!actionsColumnModel) return [];

    // Get actions from subModels.actions
    let actionModels: any[] = [];
    if (actionsColumnModel.subModels?.actions) {
      const acts = actionsColumnModel.subModels.actions;
      actionModels = Array.isArray(acts) ? acts : [acts];
    } else {
      // Try to find from descendants
      actionModels = descendants.filter(
        (m: any) =>
          m.parentId === actionsColumnModel.uid &&
          ['ViewActionModel', 'EditActionModel', 'DeleteActionModel', 'LinkActionModel', 'PopupActionModel'].includes(
            m.use
          )
      );
    }

    return actionModels.map((action: any) => {
      const actionConfig: any = {
        type: this.mapActionModelToType(action.use),
      };

      // Check for inner page (ChildPageModel in subModels.page)
      if (action.subModels?.page) {
        actionConfig.innerPage = this.extractInnerPage(action.subModels.page, descendants);
      }

      // Add button type if present
      const buttonSettings = action.stepParams?.buttonSettings;
      if (buttonSettings?.general?.type) {
        actionConfig.buttonType = buttonSettings.general.type;
      }

      return actionConfig;
    });
  }

  /**
   * Extract inner page configuration from ChildPageModel
   */
  private extractInnerPage(pageModel: any, descendants: any[]): any {
    const pageSettings = pageModel.stepParams?.pageSettings?.general || {};

    const innerPage: any = {
      displayTitle: pageSettings.displayTitle ?? false,
      enableTabs: pageSettings.enableTabs ?? true,
    };

    // Extract tabs
    if (pageModel.subModels?.tabs) {
      const tabs = Array.isArray(pageModel.subModels.tabs)
        ? pageModel.subModels.tabs
        : [pageModel.subModels.tabs];

      innerPage.tabs = tabs.map((tab: any) => this.extractTab(tab, descendants));
    }

    return innerPage;
  }

  /**
   * Extract tab configuration from ChildPageTabModel
   */
  private extractTab(tabModel: any, descendants: any[]): any {
    const tabSettings = tabModel.stepParams?.pageTabSettings?.tab || {};

    const tab: any = {
      title: tabSettings.title || 'Untitled',
    };

    // Extract blocks from grid
    if (tabModel.subModels?.grid) {
      const gridModel = tabModel.subModels.grid;
      tab.blocks = this.extractBlocksFromGrid(gridModel, descendants);
    }

    return tab;
  }

  /**
   * Extract blocks from a BlockGridModel
   */
  private extractBlocksFromGrid(gridModel: any, descendants: any[]): any[] {
    const blocks: any[] = [];

    // Get items from subModels.items
    let blockModels: any[] = [];
    if (gridModel.subModels?.items) {
      const items = gridModel.subModels.items;
      blockModels = Array.isArray(items) ? items : [items];
    }

    for (const blockModel of blockModels) {
      const blockConfig = this.buildBlockConfig(blockModel, descendants);
      if (blockConfig) {
        blocks.push(blockConfig);
      }
    }

    return blocks;
  }

  /**
   * Map display model type to config displayType
   */
  private mapDisplayModelToType(modelType: string | undefined): string | undefined {
    if (!modelType) return undefined;

    const map: Record<string, string> = {
      DisplayTextFieldModel: 'text',
      DisplayCheckboxFieldModel: 'checkbox',
      DisplayDateFieldModel: 'date',
      DisplayNumberFieldModel: 'number',
      DisplaySelectFieldModel: 'select',
      DisplayTagFieldModel: 'tag',
      DisplayLinkFieldModel: 'link',
      DisplayImageFieldModel: 'image',
    };

    return map[modelType];
  }

  /**
   * Build ChartBlockConfig from flowModel
   */
  private buildChartConfig(model: any): ChartBlockConfig {
    const stepParams = model.stepParams || {};
    const chartSettings = stepParams.chartSettings?.configure || {};
    const query = chartSettings.query || {};
    const chartOption = chartSettings.chart?.option || {};

    const collectionName = query.collectionPath?.[1] || '';
    const dimension = query.dimensions?.[0]?.field?.[0] || '';
    const measure = query.measures?.[0] || {};

    return {
      type: 'ChartBlockModel',
      collection: collectionName,
      chart: {
        type: chartOption.builder?.type || 'bar',
        dimension,
        measure: {
          field: measure.field?.[0] || 'id',
          aggregation: measure.aggregation || 'count',
        },
        options: {
          legend: chartOption.builder?.legend,
          tooltip: chartOption.builder?.tooltip,
        },
      },
    };
  }

  /**
   * Build DetailsBlockConfig from flowModel
   */
  private buildDetailsConfig(model: any, descendants: any[]): DetailsBlockConfig {
    const stepParams = model.stepParams || {};
    const collectionName = stepParams.resourceSettings?.init?.collectionName || '';

    // Find field items - check both descendants and inline subModels
    let itemModels = descendants.filter((m: any) => m.parentId === model.uid && m.use === 'DetailsItemModel');
    if (itemModels.length === 0 && model.subModels?.items) {
      const items = Array.isArray(model.subModels.items) ? model.subModels.items : [model.subModels.items];
      itemModels = items.filter((m: any) => m.use === 'DetailsItemModel');
    }

    const fields = itemModels.map((item: any) => ({
      field: item.stepParams?.fieldSettings?.init?.fieldPath || '',
      span: item.stepParams?.layoutSettings?.init?.span,
    }));

    return {
      type: 'DetailsBlockModel',
      collection: collectionName,
      fields: fields.filter((f: any) => f.field),
    };
  }

  /**
   * Build FormBlockConfig from flowModel
   */
  private buildFormConfig(model: any, descendants: any[]): FormBlockConfig {
    const stepParams = model.stepParams || {};
    const collectionName = stepParams.resourceSettings?.init?.collectionName || '';

    // Find field items - check both descendants and inline subModels
    let itemModels = descendants.filter((m: any) => m.parentId === model.uid && m.use === 'FormItemModel');
    if (itemModels.length === 0 && model.subModels?.items) {
      const items = Array.isArray(model.subModels.items) ? model.subModels.items : [model.subModels.items];
      itemModels = items.filter((m: any) => m.use === 'FormItemModel');
    }

    const fields = itemModels.map((item: any) => ({
      field: item.stepParams?.fieldSettings?.init?.fieldPath || '',
      required: item.stepParams?.formItemSettings?.init?.required,
      placeholder: item.stepParams?.formItemSettings?.init?.placeholder,
    }));

    return {
      type: 'FormBlockModel',
      collection: collectionName,
      fields: fields.filter((f: any) => f.field),
    };
  }

  /**
   * Build layout from grid settings
   */
  private buildLayoutFromGrid(gridSettings: GridSettings | undefined, blockModels: any[]): LayoutConfig {
    if (!gridSettings?.grid) {
      // Default single-column layout
      return {
        rows: [
          {
            columns: [
              {
                width: 24,
                blocks: blockModels.map((m: any) => ({ $ref: `#/blocks/block_${blockModels.indexOf(m) + 1}` })),
              },
            ],
          },
        ],
      };
    }

    const { rows, sizes, rowOrder } = gridSettings.grid;
    const layoutRows: LayoutRow[] = [];

    for (const rowId of rowOrder) {
      const rowColumns = rows[rowId] || [];
      const rowSizes = sizes[rowId] || [];

      const columns: LayoutColumn[] = rowColumns.map((colBlocks, colIdx) => ({
        width: rowSizes[colIdx] || 24,
        blocks: colBlocks.map((blockUid) => ({ $ref: `#/blocks/${blockUid}` })),
      }));

      layoutRows.push({ columns });
    }

    return { rows: layoutRows };
  }

  /**
   * Update layout block references with proper names
   * Filters out orphaned references (UIDs that don't map to exported blocks)
   */
  private updateLayoutBlockRefs(layout: LayoutConfig, blockModels: any[], blocks: Record<string, BlockConfig>): void {
    // Create UID to name mapping
    const uidToName: Record<string, string> = {};
    const blockNames = Object.keys(blocks);

    blockModels.forEach((model, idx) => {
      if (idx < blockNames.length) {
        uidToName[model.uid] = blockNames[idx];
      }
    });

    // Update refs in layout, filtering out orphaned references
    for (const row of layout.rows) {
      for (const col of row.columns) {
        col.blocks = col.blocks
          .map((ref) => {
            const uid = ref.$ref.replace('#/blocks/', '');
            const name = uidToName[uid];
            // Only include refs that map to exported blocks
            return name ? { $ref: `#/blocks/${name}` } : null;
          })
          .filter((ref): ref is { $ref: string } => ref !== null);
      }
    }
  }

  /**
   * Map action model type to config type
   */
  private mapActionModelToType(modelType: string): string {
    const map: Record<string, string> = {
      FilterActionModel: 'filter',
      ViewActionModel: 'view',
      EditActionModel: 'edit',
      DeleteActionModel: 'delete',
      CreateActionModel: 'create',
      RefreshActionModel: 'refresh',
      ExportActionModel: 'export',
    };
    return map[modelType] || 'view';
  }

  /**
   * Create a friendly collection alias
   */
  private createCollectionAlias(collectionName: string, existingAliases: Record<string, string>): string {
    // Try to get a title from the collection metadata
    // For now, use the collection name without t_ prefix
    let alias = collectionName.replace(/^t_/, 'Collection_');

    // Make sure it's unique
    let counter = 1;
    let finalAlias = alias;
    while (Object.prototype.hasOwnProperty.call(existingAliases, finalAlias)) {
      finalAlias = `${alias}_${counter}`;
      counter++;
    }

    return finalAlias;
  }
}
