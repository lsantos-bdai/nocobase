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
} from '../types';
import { parseYaml, validatePageConfig, resolveCollection, extractBlockName } from './yaml-parser';
import { RouteResolver } from './route-resolver';
import {
  generateUid,
  generateBlockGrid,
  generateTable,
  saveTable,
  generateChart,
  saveChart,
  generateDetails,
  saveDetails,
  generateForm,
  saveForm,
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

    // Step 2: Create RootPageModel
    const pageUid = generateUid();
    const gridUid = generateUid();

    // Step 3: Create uiSchema with FlowRoute
    const schemaUid = await this.createUiSchema(pageUid, title);

    // Step 4: Create route entry
    const routeId = await this.routeResolver.createRoute({
      title,
      parentPath: parentPath || undefined,
      schemaUid,
      icon: config.page.icon,
    });

    // Step 5: Create RootPageModel flowModel (no parent - it's the root)
    await this.createRootPageModel(pageUid, title);

    // Step 6: Create BlockGridModel with parent relationship
    const blockGrid = generateBlockGrid(
      { layout: config.layout, blockUids },
      pageUid,  // Parent is the RootPageModel
      0         // First child
    );
    // Override the generated UID with our pre-assigned one
    blockGrid.uid = gridUid;
    blockGrid.flowModel.uid = gridUid;

    // Save BlockGridModel (already has parent relationship)
    await this.db.getRepository('flowModels').create({
      values: blockGrid.flowModel,
    });

    // Step 7: Create all blocks with correct parent relationships
    let sortIndex = 0;
    for (const [blockName, blockConfig] of Object.entries(config.blocks)) {
      const blockUid = blockUids[blockName];
      await this.createBlock(blockConfig, blockUid, gridUid, sortIndex, collections);
      sortIndex++;
    }

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
   */
  private async createUiSchema(pageUid: string, title: string): Promise<string> {
    const schemaUid = generateUid();

    try {
      const uiSchemaRepo = this.db.getRepository('uiSchemas');
      await uiSchemaRepo.create({
        values: {
          'x-uid': schemaUid,
          name: schemaUid,
          title,
          'x-component': 'FlowRoute',
          'x-component-props': {
            uid: pageUid,
          },
        },
      });
    } catch {
      // If uiSchemas doesn't work the same way, try alternative
      // The schema might be stored differently in newer versions
    }

    return schemaUid;
  }

  /**
   * Create the root page model
   */
  private async createRootPageModel(uid: string, title: string): Promise<void> {
    const repo = this.db.getRepository('flowModels');

    await repo.create({
      values: {
        uid,
        use: 'RootPageModel',
        name: title,
        stepParams: {
          pageSettings: {
            init: {
              title,
            },
          },
        },
        flowRegistry: {},
      },
    });
  }

  /**
   * Create a block based on its type
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
   * Create a table block
   *
   * Generates with parent relationship from the start and overrides UID.
   */
  private async createTableBlock(
    config: TableBlockConfig,
    uid: string,
    parentGridUid: string,
    sortIndex: number,
    collectionName: string
  ): Promise<void> {
    const table = generateTable(config, collectionName, parentGridUid, sortIndex);
    // Override with pre-assigned UID (also update children's parentId)
    table.uid = uid;
    table.flowModel.uid = uid;
    // Update columns and actions to reference the correct parent UID
    for (const col of table.columns) {
      col.flowModel.parentId = uid;
    }
    for (const action of table.actions) {
      action.flowModel.parentId = uid;
    }
    await saveTable(this.db, table);
  }

  /**
   * Create a chart block
   *
   * Generates with parent relationship from the start and overrides UID.
   */
  private async createChartBlock(
    config: ChartBlockConfig,
    uid: string,
    parentGridUid: string,
    sortIndex: number,
    collectionName: string
  ): Promise<void> {
    const chart = generateChart(config, collectionName, parentGridUid, sortIndex);
    // Override with pre-assigned UID
    chart.uid = uid;
    chart.flowModel.uid = uid;
    await saveChart(this.db, chart);
  }

  /**
   * Create a details block
   *
   * Generates with parent relationship from the start and overrides UID.
   */
  private async createDetailsBlock(
    config: DetailsBlockConfig,
    uid: string,
    parentGridUid: string,
    sortIndex: number,
    collectionName: string
  ): Promise<void> {
    const details = generateDetails(config, collectionName, parentGridUid, sortIndex);
    // Override with pre-assigned UID (also update children's parentId)
    details.uid = uid;
    details.flowModel.uid = uid;
    // Update items and actions to reference the correct parent UID
    for (const item of details.items) {
      item.flowModel.parentId = uid;
    }
    for (const action of details.actions) {
      action.flowModel.parentId = uid;
    }
    await saveDetails(this.db, details);
  }

  /**
   * Create a form block
   *
   * Generates with parent relationship from the start and overrides UID.
   */
  private async createFormBlock(
    config: FormBlockConfig,
    uid: string,
    parentGridUid: string,
    sortIndex: number,
    collectionName: string
  ): Promise<void> {
    const form = generateForm(config, collectionName, parentGridUid, sortIndex);
    // Override with pre-assigned UID (also update children's parentId)
    form.uid = uid;
    form.flowModel.uid = uid;
    // Update items and submit action to reference the correct parent UID
    for (const item of form.items) {
      item.flowModel.parentId = uid;
    }
    if (form.submitAction) {
      form.submitAction.flowModel.parentId = uid;
    }
    await saveForm(this.db, form);
  }

  /**
   * Create a markdown block
   */
  private async createMarkdownBlock(
    config: { type: string; content?: string },
    uid: string,
    parentGridUid: string,
    sortIndex: number
  ): Promise<void> {
    const repo = this.db.getRepository('flowModels');

    await repo.create({
      values: {
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
      },
    });
  }
}
