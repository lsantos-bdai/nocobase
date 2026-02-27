/**
 * Page Generator Service
 *
 * Orchestrates the creation of complete pages from YAML configuration.
 * Creates routes, uiSchemas, and flowModels in the proper order with
 * correct parent-child relationships.
 */
import type { Database } from '@nocobase/database';
import type { Application } from '@nocobase/server';
import type {
  PageConfig,
  ValidatedPageConfig,
  BlockConfig,
  TableBlockConfig,
  ChartBlockConfig,
  DetailsBlockConfig,
  FormBlockConfig,
  CreateResponse,
  FlowModel,
} from '../types';
import { parseYaml, validatePageConfig, resolveCollection, extractBlockName } from './yaml-parser';
import { RouteResolver } from './route-resolver';
import {
  generateUid,
  generateBlockGrid,
  generateTable,
  generateChart,
  generateDetails,
  generateForm,
} from '../generators';

export class PageGenerator {
  private routeResolver: RouteResolver;

  constructor(
    private db: Database,
    private app: Application
  ) {
    this.routeResolver = new RouteResolver(db);
  }

  /**
   * Create a page from YAML configuration
   */
  async createFromYaml(
    yamlContent: string,
    options: { force?: boolean } = {}
  ): Promise<CreateResponse> {
    // Parse and validate YAML
    const config = parseYaml(yamlContent);
    const validation = validatePageConfig(config);

    if (!validation.valid || !validation.config) {
      throw new Error(`YAML validation failed: ${validation.errors.join('; ')}`);
    }

    const validatedConfig = validation.config;

    // Determine route path
    const routePath = validatedConfig.page.route || validatedConfig.page.title;
    const { parentPath, title } = this.routeResolver.parseRoutePath(routePath);

    // Check if page already exists
    const existingRoute = await this.routeResolver.resolveByPath(routePath);
    if (existingRoute) {
      if (options.force) {
        // Delete existing page first
        await this.deleteByPath(routePath);
      } else {
        throw new Error(`Page already exists at path: ${routePath}. Use force=true to overwrite.`);
      }
    }

    // Create the page structure
    const result = await this.createPage(validatedConfig, parentPath, title);

    return result;
  }

  /**
   * Delete a page by its route path
   */
  async deleteByPath(path: string): Promise<{ deleted: boolean; flowModelsDeleted: number }> {
    const resolved = await this.routeResolver.resolveByPath(path);
    if (!resolved) {
      throw new Error(`Page not found at path: ${path}`);
    }

    // Delete all flowModels associated with this page
    const flowModelsDeleted = await this.deleteFlowModelTree(resolved.pageUid);

    // Delete the uiSchema
    try {
      const uiSchemaRepo = this.db.getRepository('uiSchemas');
      await uiSchemaRepo.destroy({
        filter: { 'x-uid': resolved.schemaUid },
      });
    } catch {
      // uiSchema might not exist or have different structure
    }

    // Delete the route
    await this.routeResolver.deleteRoute(resolved.routeId);

    return { deleted: true, flowModelsDeleted };
  }

  /**
   * Delete a flowModel and all its descendants using the specialized repository method.
   *
   * FlowModelRepository.remove() properly handles:
   * - Deleting all descendants via the closure table
   * - Cleaning up tree path entries
   */
  private async deleteFlowModelTree(rootUid: string): Promise<number> {
    try {
      const repo = this.getFlowModelRepository();

      // Count descendants before deletion
      const descendants = await this.db.sequelize.query(
        `SELECT COUNT(*) as count FROM "flowModelTreePath" WHERE ancestor = :rootUid`,
        {
          replacements: { rootUid },
          type: 'SELECT',
        }
      ) as Array<{ count: string }>;

      const count = parseInt(descendants[0]?.count || '0', 10);

      // Use the specialized remove method which handles tree deletion
      await repo.remove(rootUid);

      return count;
    } catch (err) {
      // Log but don't fail - the page deletion might still succeed
      console.error('Failed to delete flowModel tree:', err);
      return 0;
    }
  }

  /**
   * Create all page components
   *
   * NocoBase flowPage structure:
   * - desktopRoutes: flowPage entry → tabs child entry
   * - uiSchemas: FlowRoute schema pointing to RootPageModel
   * - flowModels: RootPageModel → BlockGridModel → blocks
   *
   * The BlockGridModel's parentId must point to the tabs schemaUid for proper rendering.
   *
   * CRITICAL: Each flowModel must be saved SEPARATELY with parentId, subKey, subType.
   * This ensures the closure table (flowModelTreePath) is populated correctly.
   * See: nocobase-ui-manipulation.md lines 282-333 for the complete working example.
   */
  private async createPage(
    config: ValidatedPageConfig,
    parentPath: string | null,
    title: string
  ): Promise<CreateResponse> {
    const collections = config._resolvedCollections;

    // Step 1: Generate UIDs for all blocks first (needed for grid layout)
    const blockUids: Record<string, string> = {};
    for (const blockName of Object.keys(config.blocks)) {
      blockUids[blockName] = generateUid();
    }

    // Step 2: Generate UIDs for page structure
    const pageUid = generateUid();
    const gridUid = generateUid();
    const tabsSchemaUid = generateUid();

    // Step 3: Create uiSchema with FlowRoute
    const schemaUid = await this.createUiSchema();

    // Step 4: Create route entry (flowPage + tabs child)
    const { routeId } = await this.routeResolver.createRoute({
      title,
      parentPath: parentPath || undefined,
      schemaUid,
      tabsSchemaUid,
      icon: config.page.icon,
    });

    // Step 5: Create RootPageModel flowModel (parentId is the schemaUid for FlowRoute binding)
    await this.createRootPageModel(pageUid, schemaUid, title);

    // Step 6: Create BlockGridModel FIRST (without nested subModels)
    // The parentId must be the tabs schemaUid, NOT the page schemaUid!
    const blockGrid = generateBlockGrid(
      { layout: config.layout, blockUids },
      tabsSchemaUid,
      0
    );
    blockGrid.uid = gridUid;
    blockGrid.flowModel.uid = gridUid;
    blockGrid.flowModel.parentId = tabsSchemaUid;

    // Save BlockGridModel with empty stepParams first
    // Grid layout will be updated AFTER blocks are created
    await this.saveFlowModelViaApi({
      uid: gridUid,
      parentId: tabsSchemaUid,
      subKey: 'grid',
      async: true,
      subType: 'object',
      use: 'BlockGridModel',
      stepParams: {},  // Empty initially
      sortIndex: 0,
      flowRegistry: {},
      filterManager: [],
    });

    // Step 7: Create each block INDIVIDUALLY with parentId = gridUid
    let sortIndex = 1;
    for (const [blockName, blockConfig] of Object.entries(config.blocks)) {
      const blockUid = blockUids[blockName];
      await this.createBlock(blockConfig, blockUid, gridUid, sortIndex, collections);
      sortIndex++;
    }

    // Step 8: Update BlockGridModel with the grid layout
    // Now that all blocks exist, update the grid settings
    await this.saveFlowModelViaApi({
      uid: gridUid,
      stepParams: {
        gridSettings: blockGrid.flowModel.stepParams?.gridSettings,
      },
    });

    const routePath = parentPath ? `${parentPath}/${title}` : title;

    return {
      routeId,
      pageUid,
      blocksCreated: Object.keys(config.blocks).length,
      path: routePath,
    };
  }

  /**
   * Create a single block with all its children saved individually
   */
  private async createBlock(
    config: BlockConfig,
    uid: string,
    parentGridUid: string,
    sortIndex: number,
    collections: Record<string, string>
  ): Promise<void> {
    // Resolve collection name if present
    let collectionName = '';
    if ('collection' in config && config.collection) {
      collectionName = resolveCollection(config.collection, collections);
    }

    switch (config.type) {
      case 'TableBlockModel':
        await this.createTableBlock(config as TableBlockConfig, uid, parentGridUid, sortIndex, collectionName);
        break;
      case 'ChartBlockModel':
        await this.createChartBlock(config as ChartBlockConfig, uid, parentGridUid, sortIndex, collectionName);
        break;
      case 'DetailsBlockModel':
        await this.createDetailsBlock(config as DetailsBlockConfig, uid, parentGridUid, sortIndex, collectionName);
        break;
      case 'FormBlockModel':
        await this.createFormBlock(config as FormBlockConfig, uid, parentGridUid, sortIndex, collectionName);
        break;
      case 'MarkdownBlockModel':
        await this.createMarkdownBlock(config, uid, parentGridUid, sortIndex);
        break;
      default:
        throw new Error(`Unknown block type: ${config.type}`);
    }
  }

  /**
   * Create a TableBlockModel with columns and actions saved individually
   */
  private async createTableBlock(
    config: TableBlockConfig,
    uid: string,
    parentGridUid: string,
    sortIndex: number,
    collectionName: string
  ): Promise<void> {
    const table = generateTable(config, collectionName, parentGridUid, sortIndex);
    table.uid = uid;
    table.flowModel.uid = uid;

    // Save the table block first
    await this.saveFlowModelViaApi(table.flowModel as Record<string, unknown>);

    // Save each column individually
    for (const col of table.columns) {
      col.flowModel.parentId = uid;
      await this.saveFlowModelViaApi(col.flowModel as Record<string, unknown>);
    }

    // Save each action individually
    for (const action of table.actions) {
      action.flowModel.parentId = uid;
      await this.saveFlowModelViaApi(action.flowModel as Record<string, unknown>);
    }
  }

  /**
   * Create a ChartBlockModel with proper initialization
   *
   * Charts require a 3-step process to render properly:
   * 1. Create the chart flowModel
   * 2. Call charts:query to fetch/initialize the data
   * 3. Save the flowModel again to persist the configuration
   */
  private async createChartBlock(
    config: ChartBlockConfig,
    uid: string,
    parentGridUid: string,
    sortIndex: number,
    collectionName: string
  ): Promise<void> {
    const chart = generateChart(config, collectionName, parentGridUid, sortIndex);
    chart.uid = uid;
    chart.flowModel.uid = uid;

    // Step 1: Create the chart flowModel
    await this.saveFlowModelViaApi(chart.flowModel as Record<string, unknown>);

    // Step 2: Query the chart data to initialize it
    await this.queryChartData(collectionName, config.chart.dimension, config.chart.measure.field);

    // Step 3: Save again to persist the configuration
    await this.saveFlowModelViaApi(chart.flowModel as Record<string, unknown>);
  }

  /**
   * Query chart data to initialize the chart
   *
   * This mimics what the GUI does when configuring a chart.
   * Without this call, charts may show "Please configure chart" instead of rendering.
   */
  private async queryChartData(
    collectionName: string,
    dimension: string,
    measureField: string
  ): Promise<void> {
    try {
      const chartsResource = this.app.resourceManager.getResource('charts');
      if (chartsResource) {
        // Use the resource action directly
        await this.app.resourceManager.execute({
          resource: 'charts',
          action: 'query',
          params: {
            values: {
              mode: 'builder',
              dataSource: 'main',
              collection: collectionName,
              measures: [{ field: [measureField], aggregation: 'count', alias: measureField }],
              dimensions: [{ field: [dimension] }],
              orders: [],
            },
          },
        });
      }
    } catch (err) {
      // Log but don't fail - chart might still work on page refresh
      console.warn('Failed to query chart data:', err);
    }
  }

  /**
   * Create a DetailsBlockModel with items and actions saved individually
   */
  private async createDetailsBlock(
    config: DetailsBlockConfig,
    uid: string,
    parentGridUid: string,
    sortIndex: number,
    collectionName: string
  ): Promise<void> {
    const details = generateDetails(config, collectionName, parentGridUid, sortIndex);
    details.uid = uid;
    details.flowModel.uid = uid;

    // Save the details block first
    await this.saveFlowModelViaApi(details.flowModel as Record<string, unknown>);

    // Save each item individually
    for (const item of details.items) {
      item.flowModel.parentId = uid;
      await this.saveFlowModelViaApi(item.flowModel as Record<string, unknown>);
    }

    // Save each action individually
    for (const action of details.actions) {
      action.flowModel.parentId = uid;
      await this.saveFlowModelViaApi(action.flowModel as Record<string, unknown>);
    }
  }

  /**
   * Create a FormBlockModel with items and actions saved individually
   */
  private async createFormBlock(
    config: FormBlockConfig,
    uid: string,
    parentGridUid: string,
    sortIndex: number,
    collectionName: string
  ): Promise<void> {
    const form = generateForm(config, collectionName, parentGridUid, sortIndex);
    form.uid = uid;
    form.flowModel.uid = uid;

    // Save the form block first
    await this.saveFlowModelViaApi(form.flowModel as Record<string, unknown>);

    // Save each item individually
    for (const item of form.items) {
      item.flowModel.parentId = uid;
      await this.saveFlowModelViaApi(item.flowModel as Record<string, unknown>);
    }

    // Save submit action if present
    if (form.submitAction) {
      form.submitAction.flowModel.parentId = uid;
      await this.saveFlowModelViaApi(form.submitAction.flowModel as Record<string, unknown>);
    }
  }

  /**
   * Create a MarkdownBlockModel (no children)
   */
  private async createMarkdownBlock(
    config: { type: string; content?: string },
    uid: string,
    parentGridUid: string,
    sortIndex: number
  ): Promise<void> {
    await this.saveFlowModelViaApi({
      uid,
      use: 'MarkdownBlockModel',
      parentId: parentGridUid,
      subKey: 'items',
      subType: 'array',
      sortIndex,
      stepParams: {
        markdownSettings: {
          init: {
            content: (config as any).content || '',
          },
        },
      },
      flowRegistry: {},
    });
  }

  /**
   * Create uiSchema for the page
   *
   * The uiSchema contains a FlowRoute component which finds its RootPageModel
   * via parentId/subKey lookup (parentId = schemaUid, subKey = 'page').
   */
  private async createUiSchema(): Promise<string> {
    const schemaUid = generateUid();

    try {
      const uiSchemaRepo = this.db.getRepository('uiSchemas') as any;
      // Use insert() method like the GUI does (uiSchemas:insert API)
      // This properly creates schema tree path entries
      await uiSchemaRepo.insert({
        type: 'void',
        'x-component': 'FlowRoute',
        'x-uid': schemaUid,
      });
    } catch (err) {
      // Log but don't fail - we'll still return the schemaUid
      console.error('Failed to insert uiSchema:', err);
    }

    return schemaUid;
  }

  /**
   * Get the FlowModelRepository with proper type.
   *
   * CRITICAL: Use db.getCollection('flowModels').repository, NOT db.getRepository('flowModels').
   * The collection is configured with repository: 'FlowModelRepository' which provides
   * the specialized upsertModel() method. db.getRepository() returns a generic Repository
   * without these methods.
   */
  private getFlowModelRepository() {
    const collection = this.db.getCollection('flowModels');
    if (!collection) {
      throw new Error('flowModels collection not found - is plugin-flow-engine loaded?');
    }

    const repo = collection.repository as any;
    if (!repo.upsertModel) {
      throw new Error('FlowModelRepository.upsertModel() not available - repository type mismatch');
    }

    return repo;
  }

  /**
   * Save a flowModel using the FlowModelRepository.upsertModel() method.
   *
   * This properly handles subModels and creates tree path entries correctly,
   * similar to what the flowModels:save API endpoint does.
   *
   * The upsertModel method recursively processes the model structure:
   * - Extracts nested subModels
   * - Converts to flat nodes with proper childOptions
   * - Inserts each node with tree path entries via insertSingleNode
   */
  private async saveFlowModelViaApi(flowModel: Record<string, unknown>): Promise<string> {
    const repo = this.getFlowModelRepository();

    const uid = await repo.upsertModel(flowModel);

    if (!uid) {
      throw new Error(`upsertModel returned falsy uid for flowModel: ${flowModel.uid}`);
    }

    return uid;
  }

  /**
   * Create the root page model
   *
   * The RootPageModel is bound to the page route via its parentId.
   * parentId = page's schemaUid, subKey = "page", subType = "object"
   *
   * This matches what the GUI creates when making a new flowPage.
   */
  private async createRootPageModel(uid: string, schemaUid: string, title: string): Promise<void> {
    // Match the GUI's RootPageModel creation exactly
    // GUI: {"uid":"...","async":true,"parentId":"...","subKey":"page","subType":"object","use":"RootPageModel","stepParams":{},"sortIndex":0,"flowRegistry":{}}
    await this.saveFlowModelViaApi({
      uid,
      async: true,  // GUI uses async: true
      parentId: schemaUid,  // The page's schemaUid
      subKey: 'page',
      subType: 'object',
      use: 'RootPageModel',
      stepParams: {},  // GUI has empty stepParams
      sortIndex: 0,
      flowRegistry: {},
    });
  }

}
