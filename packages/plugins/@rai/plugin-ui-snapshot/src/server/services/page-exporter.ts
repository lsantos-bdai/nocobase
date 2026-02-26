/**
 * Page Exporter Service
 *
 * Exports existing NocoBase UI pages to YAML configuration format.
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
import { toYaml } from './yaml-parser';

export class PageExporter {
  private routeResolver: RouteResolver;

  constructor(private db: Database) {
    this.routeResolver = new RouteResolver(db);
  }

  /**
   * Export a single page to YAML by its route path
   *
   * Uses the closure table (flowModelTreePath) to reliably get all
   * flowModels in the page's tree.
   */
  async exportByPath(path: string): Promise<string> {
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

    return toYaml(config);
  }

  /**
   * Export all pages to a single YAML snapshot
   */
  async exportAllPages(): Promise<string> {
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

    const snapshot: UISnapshotConfig = {
      version: '1.0',
      exported_at: new Date().toISOString(),
      collections: allCollections,
      pages: configs.map((config) => ({ page: config })),
    };

    return toYaml(snapshot as any);
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
    let columnModels = descendants.filter((m: any) => m.parentId === model.uid && m.use === 'TableColumnModel');
    if (columnModels.length === 0 && model.subModels?.columns) {
      const cols = Array.isArray(model.subModels.columns) ? model.subModels.columns : [model.subModels.columns];
      columnModels = cols.filter((m: any) => m.use === 'TableColumnModel');
    }

    const columns = columnModels.map((col: any) => ({
      field: col.stepParams?.fieldSettings?.init?.fieldPath || '',
      sortable: col.stepParams?.columnSettings?.init?.sortable,
      width: col.stepParams?.columnSettings?.init?.width,
      fixed: col.stepParams?.columnSettings?.init?.fixed,
    }));

    // Find actions - check both descendants and inline subModels
    let actionModels = descendants.filter(
      (m: any) =>
        m.parentId === model.uid &&
        ['FilterActionModel', 'ViewActionModel', 'EditActionModel', 'DeleteActionModel', 'CreateActionModel'].includes(
          m.use
        )
    );
    if (actionModels.length === 0 && model.subModels?.actions) {
      const acts = Array.isArray(model.subModels.actions) ? model.subModels.actions : [model.subModels.actions];
      actionModels = acts.filter((m: any) =>
        ['FilterActionModel', 'ViewActionModel', 'EditActionModel', 'DeleteActionModel', 'CreateActionModel'].includes(
          m.use
        )
      );
    }

    const actions = actionModels.map((action: any) => ({
      type: this.mapActionModelToType(action.use),
    }));

    return {
      type: 'TableBlockModel',
      collection: collectionName,
      columns: columns.filter((c: any) => c.field),
      actions: actions.length > 0 ? actions : undefined,
      pageSize: stepParams.tableSettings?.init?.pageSize,
    };
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

    // Update refs in layout
    for (const row of layout.rows) {
      for (const col of row.columns) {
        col.blocks = col.blocks.map((ref) => {
          const uid = ref.$ref.replace('#/blocks/', '');
          const name = uidToName[uid] || uid;
          return { $ref: `#/blocks/${name}` };
        });
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
