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
   * Delete a flowModel and all its descendants
   */
  private async deleteFlowModelTree(rootUid: string): Promise<number> {
    const repo = this.db.getRepository('flowModels');
    let deleted = 0;

    // Get all descendants using the tree path
    // NocoBase uses a closure table for flowModel hierarchy
    try {
      const descendants = await this.db.sequelize.query(
        `SELECT descendant FROM "flowModelTreePath" WHERE ancestor = :rootUid`,
        {
          replacements: { rootUid },
          type: 'SELECT',
        }
      ) as Array<{ descendant: string }>;

      // Delete all descendants
      for (const { descendant } of descendants) {
        await repo.destroy({
          filter: { uid: descendant },
        });
        deleted++;
      }
    } catch {
      // Fallback: just delete the root
      await repo.destroy({
        filter: { uid: rootUid },
      });
      deleted = 1;
    }

    return deleted;
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
   * CRITICAL: All flowModels are created with parentId, subKey, subType from the start.
   * This ensures the closure table (flowModelTreePath) is populated correctly.
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

    // Step 6: Build all block models as nested subModels structure
    // This is CRITICAL - the API requires subModels for proper tree path creation
    const blockItems: Record<string, unknown>[] = [];
    let sortIndex = 1; // Start at 1 like the GUI does

    for (const [blockName, blockConfig] of Object.entries(config.blocks)) {
      const blockUid = blockUids[blockName];
      const blockModel = await this.buildBlockModel(blockConfig, blockUid, gridUid, sortIndex, collections);
      blockItems.push(blockModel);
      sortIndex++;
    }

    // Step 7: Build BlockGridModel with blocks nested in subModels.items
    const blockGrid = generateBlockGrid(
      { layout: config.layout, blockUids },
      tabsSchemaUid,
      0
    );
    blockGrid.uid = gridUid;
    blockGrid.flowModel.uid = gridUid;
    blockGrid.flowModel.parentId = tabsSchemaUid;

    // Add async flag and subModels for proper API save
    // Match GUI pattern: {"uid":"...","parentId":"...","subKey":"grid","async":true,"subType":"object","use":"BlockGridModel","stepParams":{},"sortIndex":0,"flowRegistry":{},"filterManager":[]}
    const gridWithSubModels = {
      ...blockGrid.flowModel,
      async: true,
      filterManager: [],  // GUI includes this
      subModels: {
        items: blockItems,
      },
    };

    // Step 8: Save the entire grid hierarchy in one API call
    await this.saveFlowModelViaApi(gridWithSubModels);

    const routePath = parentPath ? `${parentPath}/${title}` : title;

    return {
      routeId,
      pageUid,
      blocksCreated: Object.keys(config.blocks).length,
      path: routePath,
    };
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
   * Save a flowModel using the FlowModelRepository.upsertModel() method.
   *
   * NOTE: This may not properly create tree path entries for nested structures.
   * For full hierarchy with children, use saveFlowModelViaApi() instead.
   */
  private async saveFlowModel(flowModel: Partial<FlowModel>): Promise<string> {
    const repo = this.db.getRepository('flowModels') as any;
    return repo.upsertModel(flowModel);
  }

  /**
   * Save a flowModel using the FlowModelRepository's saveModel method.
   *
   * This properly handles subModels and creates tree path entries correctly,
   * similar to what the flowModels:save API endpoint does.
   */
  private async saveFlowModelViaApi(flowModel: Record<string, unknown>): Promise<string> {
    const repo = this.db.getRepository('flowModels') as any;

    // Use saveModel which handles nested subModels correctly
    // This is the same method the flowModels:save action uses
    if (repo.saveModel) {
      return repo.saveModel(flowModel);
    }

    // Fallback to upsertModel if saveModel doesn't exist
    return repo.upsertModel(flowModel);
  }

  /**
   * Build a block model with its children as nested subModels.
   *
   * This creates the nested structure required by the flowModels:save API
   * for proper tree path creation.
   */
  private async buildBlockModel(
    config: BlockConfig,
    uid: string,
    parentGridUid: string,
    sortIndex: number,
    collections: Record<string, string>
  ): Promise<Record<string, unknown>> {
    // Resolve collection name if present
    let collectionName = '';
    if ('collection' in config && config.collection) {
      collectionName = resolveCollection(config.collection, collections);
    }

    switch (config.type) {
      case 'TableBlockModel':
        return this.buildTableBlockModel(config as TableBlockConfig, uid, parentGridUid, sortIndex, collectionName);
      case 'ChartBlockModel':
        return this.buildChartBlockModel(config as ChartBlockConfig, uid, parentGridUid, sortIndex, collectionName);
      case 'DetailsBlockModel':
        return this.buildDetailsBlockModel(config as DetailsBlockConfig, uid, parentGridUid, sortIndex, collectionName);
      case 'FormBlockModel':
        return this.buildFormBlockModel(config as FormBlockConfig, uid, parentGridUid, sortIndex, collectionName);
      case 'MarkdownBlockModel':
        return this.buildMarkdownBlockModel(config, uid, parentGridUid, sortIndex);
      default:
        throw new Error(`Unknown block type: ${config.type}`);
    }
  }

  /**
   * Build a TableBlockModel with columns and actions as nested subModels
   */
  private buildTableBlockModel(
    config: TableBlockConfig,
    uid: string,
    parentGridUid: string,
    sortIndex: number,
    collectionName: string
  ): Record<string, unknown> {
    const table = generateTable(config, collectionName, parentGridUid, sortIndex);
    table.uid = uid;
    table.flowModel.uid = uid;

    // Build nested subModels structure
    const columns = table.columns.map((col) => {
      col.flowModel.parentId = uid;
      return col.flowModel;
    });

    const actions = table.actions.map((action) => {
      action.flowModel.parentId = uid;
      return action.flowModel;
    });

    return {
      ...table.flowModel,
      subModels: {
        columns,
        actions,
      },
    };
  }

  /**
   * Build a ChartBlockModel (no children)
   */
  private buildChartBlockModel(
    config: ChartBlockConfig,
    uid: string,
    parentGridUid: string,
    sortIndex: number,
    collectionName: string
  ): Record<string, unknown> {
    const chart = generateChart(config, collectionName, parentGridUid, sortIndex);
    chart.uid = uid;
    chart.flowModel.uid = uid;
    return chart.flowModel as Record<string, unknown>;
  }

  /**
   * Build a DetailsBlockModel with items and actions as nested subModels
   */
  private buildDetailsBlockModel(
    config: DetailsBlockConfig,
    uid: string,
    parentGridUid: string,
    sortIndex: number,
    collectionName: string
  ): Record<string, unknown> {
    const details = generateDetails(config, collectionName, parentGridUid, sortIndex);
    details.uid = uid;
    details.flowModel.uid = uid;

    const items = details.items.map((item) => {
      item.flowModel.parentId = uid;
      return item.flowModel;
    });

    const actions = details.actions.map((action) => {
      action.flowModel.parentId = uid;
      return action.flowModel;
    });

    return {
      ...details.flowModel,
      subModels: {
        items,
        actions,
      },
    };
  }

  /**
   * Build a FormBlockModel with items and actions as nested subModels
   */
  private buildFormBlockModel(
    config: FormBlockConfig,
    uid: string,
    parentGridUid: string,
    sortIndex: number,
    collectionName: string
  ): Record<string, unknown> {
    const form = generateForm(config, collectionName, parentGridUid, sortIndex);
    form.uid = uid;
    form.flowModel.uid = uid;

    const items = form.items.map((item) => {
      item.flowModel.parentId = uid;
      return item.flowModel;
    });

    const actions: Record<string, unknown>[] = [];
    if (form.submitAction) {
      form.submitAction.flowModel.parentId = uid;
      actions.push(form.submitAction.flowModel as Record<string, unknown>);
    }

    return {
      ...form.flowModel,
      subModels: {
        items,
        actions,
      },
    };
  }

  /**
   * Build a MarkdownBlockModel (no children)
   */
  private buildMarkdownBlockModel(
    config: { type: string; content?: string },
    uid: string,
    parentGridUid: string,
    sortIndex: number
  ): Record<string, unknown> {
    return {
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
    };
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
