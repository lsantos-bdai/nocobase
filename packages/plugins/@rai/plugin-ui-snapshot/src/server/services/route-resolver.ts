/**
 * Route Resolver Service
 *
 * Resolves route paths (e.g., "EngOps/Workstations") to NocoBase route IDs,
 * schema UIDs, and page UIDs.
 *
 * Uses NocoBase's built-in APIs (uiSchemas:getJsonSchema) for reliable resolution.
 */
import type { Database } from '@nocobase/database';
import type { ResolvedRoute, RouteEntry, FlowModel } from '../types';
import { generateUid } from '../generators/uid';

/**
 * Page type classification
 */
export type PageType = 'flowPage' | 'page' | 'tabsPage';

/**
 * Extended resolved route with page type information
 */
export interface ResolvedRouteExtended extends ResolvedRoute {
  type: PageType;
}

export class RouteResolver {
  constructor(private db: Database) {}

  /**
   * Resolve a path like "EngOps/Sensors/RealSense" to route/schema/page info
   *
   * Uses NocoBase's built-in APIs for reliable resolution across all page types.
   */
  async resolveByPath(path: string): Promise<ResolvedRoute | null> {
    console.log(`[RouteResolver] resolveByPath called with path: "${path}"`);

    const pathParts = path.split('/').filter(Boolean);
    console.log(`[RouteResolver] Path parts:`, pathParts);

    if (pathParts.length === 0) {
      console.log(`[RouteResolver] Empty path parts, returning null`);
      return null;
    }

    // Get all routes as a tree
    const routes = await this.getRoutesTree();
    console.log(`[RouteResolver] Got ${routes.length} root routes`);
    console.log(`[RouteResolver] Root route titles:`, routes.map(r => r.title));

    // Navigate through the path
    let currentRoutes = routes;
    let targetRoute: RouteEntry | null = null;
    const fullPath: string[] = [];

    for (const part of pathParts) {
      console.log(`[RouteResolver] Looking for part: "${part}" in ${currentRoutes.length} routes`);
      console.log(`[RouteResolver] Available titles:`, currentRoutes.map(r => ({ title: r.title, path: r.path })));

      const found = currentRoutes.find(
        (r) => r.title.toLowerCase() === part.toLowerCase() || r.path === part
      );

      if (!found) {
        console.log(`[RouteResolver] Part "${part}" NOT FOUND, returning null`);
        return null;
      }

      console.log(`[RouteResolver] Found route: id=${found.id}, title="${found.title}", schemaUid=${found.schemaUid}, type=${found.type}`);
      fullPath.push(found.title);
      targetRoute = found;
      currentRoutes = found.children || [];
      console.log(`[RouteResolver] Moving to ${currentRoutes.length} children`);
    }

    if (!targetRoute || !targetRoute.schemaUid) {
      console.log(`[RouteResolver] No target route or no schemaUid. targetRoute=${!!targetRoute}, schemaUid=${targetRoute?.schemaUid}`);
      return null;
    }

    console.log(`[RouteResolver] Found target route. Resolving page from schemaUid: ${targetRoute.schemaUid}`);

    // Use the canonical resolution approach
    const pageInfo = await this.resolvePageFromSchema(targetRoute.schemaUid);
    if (!pageInfo) {
      console.log(`[RouteResolver] resolvePageFromSchema returned null`);
      return null;
    }

    console.log(`[RouteResolver] Successfully resolved. pageUid=${pageInfo.pageUid}, type=${pageInfo.type}`);

    return {
      routeId: targetRoute.id,
      schemaUid: targetRoute.schemaUid,
      pageUid: pageInfo.pageUid,
      title: targetRoute.title,
      path: fullPath.join('/'),
    };
  }

  /**
   * Resolve page information from a schema UID using NocoBase's canonical approach.
   *
   * This uses the same resolution path as the frontend:
   * 1. Check uiSchemas for the schema structure
   * 2. For FlowRoute components, get the flowModel UID from x-component-props
   * 3. For regular pages, traverse to find the content root
   */
  private async resolvePageFromSchema(schemaUid: string): Promise<{ pageUid: string; type: PageType } | null> {
    console.log(`[RouteResolver] resolvePageFromSchema called with schemaUid: ${schemaUid}`);

    // Try to get the schema from uiSchemas repository
    try {
      const uiSchemaRepo = this.db.getRepository('uiSchemas');
      console.log(`[RouteResolver] Got uiSchemas repository`);

      // Use getJsonSchema if available (like frontend does)
      if (typeof (uiSchemaRepo as any).getJsonSchema === 'function') {
        console.log(`[RouteResolver] getJsonSchema method is available, calling it...`);
        const schema = await (uiSchemaRepo as any).getJsonSchema(schemaUid);
        console.log(`[RouteResolver] getJsonSchema result:`, schema ? `x-component=${schema['x-component']}` : 'null');

        if (schema) {
          // FlowRoute indicates a flowPage
          if (schema['x-component'] === 'FlowRoute' && schema['x-component-props']?.uid) {
            console.log(`[RouteResolver] Found FlowRoute with uid: ${schema['x-component-props'].uid}`);
            return {
              pageUid: schema['x-component-props'].uid,
              type: 'flowPage',
            };
          }
          console.log(`[RouteResolver] Schema found but not FlowRoute or no uid. x-component=${schema['x-component']}, x-component-props=${JSON.stringify(schema['x-component-props'])}`);
        }
      } else {
        console.log(`[RouteResolver] getJsonSchema method NOT available on uiSchemas repo`);
      }
    } catch (err) {
      console.log(`[RouteResolver] Error in uiSchemas lookup:`, err);
      // Continue with fallback methods
    }

    // Fallback: direct database lookups
    console.log(`[RouteResolver] Falling back to getPageUidFromSchema`);
    return this.getPageUidFromSchema(schemaUid);
  }

  /**
   * Check if a path exists in the routes
   */
  async pathExists(path: string): Promise<boolean> {
    const resolved = await this.resolveByPath(path);
    return resolved !== null;
  }

  /**
   * Get route tree from desktopRoutes
   */
  async getRoutesTree(): Promise<RouteEntry[]> {
    console.log(`[RouteResolver] getRoutesTree called`);
    const repo = this.db.getRepository('desktopRoutes');
    const routes = await repo.find({
      sort: ['sort'],
    });
    console.log(`[RouteResolver] Found ${routes.length} total routes in database`);
    console.log(`[RouteResolver] All routes:`, routes.map((r: any) => ({ id: r.id, title: r.title, parentId: r.parentId, schemaUid: r.schemaUid, type: r.type })));

    // Build tree structure
    const tree = this.buildRouteTree(routes);
    console.log(`[RouteResolver] Built tree with ${tree.length} root entries`);
    return tree;
  }

  /**
   * Build hierarchical route tree from flat list
   */
  private buildRouteTree(routes: any[]): RouteEntry[] {
    const routeMap = new Map<number, RouteEntry>();
    const rootRoutes: RouteEntry[] = [];

    // First pass: create all route entries
    for (const route of routes) {
      const entry: RouteEntry = {
        id: route.id,
        title: route.title,
        path: route.path,
        schemaUid: route.schemaUid,
        type: route.type,
        children: [],
      };
      routeMap.set(route.id, entry);
    }

    // Second pass: build tree
    for (const route of routes) {
      const entry = routeMap.get(route.id);
      if (!entry) continue;

      if (route.parentId) {
        const parent = routeMap.get(route.parentId);
        if (parent) {
          parent.children = parent.children || [];
          parent.children.push(entry);
        }
      } else {
        rootRoutes.push(entry);
      }
    }

    return rootRoutes;
  }

  /**
   * Get the root page UID from a schema UID (fallback method)
   *
   * The hierarchy can be:
   * A) Simple page:
   *    1. schemaUid (RouteModel)
   *    2. RootPageModel (parentId: schemaUid)
   *    3. BlockGridModel (parentId: RootPageModel)
   *
   * B) Tabs page:
   *    1. schemaUid (RouteModel) - flowPage
   *    2. tabsSchemaUid (RouteModel) - tabs child
   *    3. BlockGridModel (parentId: tabsSchemaUid)
   */
  private async getPageUidFromSchema(schemaUid: string): Promise<{ pageUid: string; type: PageType } | null> {
    console.log(`[RouteResolver] getPageUidFromSchema (fallback) called with schemaUid: ${schemaUid}`);
    const flowModelRepo = this.db.getRepository('flowModels');

    // First, try to find a RootPageModel with parentId = schemaUid
    // This is the most common case for new flowPages
    try {
      console.log(`[RouteResolver] Trying: RootPageModel with parentId=${schemaUid}`);
      const pageModel = await flowModelRepo.findOne({
        filter: {
          parentId: schemaUid,
          use: 'RootPageModel',
        },
      });
      if (pageModel) {
        console.log(`[RouteResolver] Found RootPageModel: uid=${pageModel.uid}`);
        return { pageUid: pageModel.uid, type: 'flowPage' };
      }
      console.log(`[RouteResolver] No RootPageModel found with parentId=${schemaUid}`);
    } catch (err) {
      console.log(`[RouteResolver] Error finding RootPageModel:`, err);
    }

    // Check if there's a BlockGridModel directly under this schemaUid
    // This handles tabs pages where content is directly under tabs container
    try {
      console.log(`[RouteResolver] Trying: BlockGridModel with parentId=${schemaUid}`);
      const gridModel = await flowModelRepo.findOne({
        filter: {
          parentId: schemaUid,
          use: 'BlockGridModel',
        },
      });
      if (gridModel) {
        console.log(`[RouteResolver] Found BlockGridModel directly under schemaUid`);
        return { pageUid: schemaUid, type: 'tabsPage' };
      }
      console.log(`[RouteResolver] No BlockGridModel found with parentId=${schemaUid}`);
    } catch (err) {
      console.log(`[RouteResolver] Error finding BlockGridModel:`, err);
    }

    // Check for tabs children in desktopRoutes and look for content there
    try {
      console.log(`[RouteResolver] Trying: tabs children lookup`);
      const routeRepo = this.db.getRepository('desktopRoutes');
      const parentRoute = await routeRepo.findOne({
        filter: { schemaUid },
      });
      console.log(`[RouteResolver] Parent route lookup result:`, parentRoute ? `id=${parentRoute.id}` : 'null');

      if (parentRoute) {
        // Find tabs children
        const tabsChildren = await routeRepo.find({
          filter: {
            parentId: parentRoute.id,
            type: 'tabs',
          },
        });
        console.log(`[RouteResolver] Found ${tabsChildren.length} tabs children`);

        for (const tabsChild of tabsChildren) {
          console.log(`[RouteResolver] Checking tabs child: schemaUid=${tabsChild.schemaUid}`);
          if (tabsChild.schemaUid) {
            // Check if this tabs container has a BlockGridModel
            const gridInTabs = await flowModelRepo.findOne({
              filter: {
                parentId: tabsChild.schemaUid,
                use: 'BlockGridModel',
              },
            });
            if (gridInTabs) {
              console.log(`[RouteResolver] Found BlockGridModel in tabs child`);
              return { pageUid: tabsChild.schemaUid, type: 'tabsPage' };
            }
          }
        }
      }
    } catch (err) {
      console.log(`[RouteResolver] Error in tabs lookup:`, err);
    }

    // Try direct match - schema UID might be the flowModel UID itself
    try {
      console.log(`[RouteResolver] Trying: direct flowModel match for uid=${schemaUid}`);
      const directMatch = await flowModelRepo.findOne({
        filter: { uid: schemaUid },
      });
      if (directMatch) {
        console.log(`[RouteResolver] Found direct flowModel match. Full data:`, JSON.stringify(directMatch, null, 2));
        if (directMatch.use === 'RootPageModel') {
          return { pageUid: directMatch.uid, type: 'flowPage' };
        }
        // If it's a different type, maybe it IS the page model
        if (directMatch.use) {
          console.log(`[RouteResolver] Direct match has use=${directMatch.use}, treating as flowPage`);
          return { pageUid: directMatch.uid, type: 'flowPage' };
        }
      } else {
        console.log(`[RouteResolver] No direct flowModel match found`);
      }
    } catch (err) {
      console.log(`[RouteResolver] Error in direct match:`, err);
    }

    // Try finding by looking at uiSchemas for the FlowRoute reference
    try {
      console.log(`[RouteResolver] Trying: uiSchemas lookup for x-uid=${schemaUid}`);
      const uiSchemaRepo = this.db.getRepository('uiSchemas');
      const schema = await uiSchemaRepo.findOne({
        filter: { 'x-uid': schemaUid },
      });
      console.log(`[RouteResolver] uiSchemas findOne result:`, schema ? 'found' : 'null');

      if (schema) {
        // Dump the full schema to see its structure
        console.log(`[RouteResolver] Full schema data:`, JSON.stringify(schema, null, 2));

        // Look for FlowRoute component that references a flowModel
        const schemaData = schema.schema || schema;
        console.log(`[RouteResolver] Schema data x-component:`, schemaData['x-component']);
        console.log(`[RouteResolver] Schema data x-component-props:`, JSON.stringify(schemaData['x-component-props']));

        if (schemaData['x-component'] === 'FlowRoute') {
          // Try various ways to find the uid
          const uid = schemaData['x-component-props']?.uid
            || schemaData['x-decorator-props']?.uid
            || schemaData['x-uid']
            || schemaData['uid'];
          console.log(`[RouteResolver] Extracted uid from schema: ${uid}`);

          if (uid) {
            return { pageUid: uid, type: 'flowPage' };
          }

          // If no uid found in schema, maybe the schemaUid IS the flowModel uid
          console.log(`[RouteResolver] No uid in schema props, using schemaUid as pageUid`);
          return { pageUid: schemaUid, type: 'flowPage' };
        }
      }
    } catch (err) {
      console.log(`[RouteResolver] Error in uiSchemas findOne:`, err);
    }

    // Last resort: query flowModels table to see what columns exist
    try {
      console.log(`[RouteResolver] Trying: raw query to inspect flowModels structure`);
      const rawResults = await this.db.sequelize.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'flowModels' ORDER BY ordinal_position`,
        { type: 'SELECT' }
      );
      console.log(`[RouteResolver] flowModels columns:`, rawResults);

      // Try to find any flowModel and see its structure
      const sampleResults = await this.db.sequelize.query(
        `SELECT * FROM "flowModels" LIMIT 1`,
        { type: 'SELECT' }
      );
      console.log(`[RouteResolver] Sample flowModel:`, JSON.stringify(sampleResults[0], null, 2));
    } catch (err) {
      console.log(`[RouteResolver] Error in raw query:`, err);
    }

    console.log(`[RouteResolver] All methods exhausted, returning null`);
    return null;
  }

  /**
   * Get all flowModels in a page's tree.
   *
   * NocoBase page structure:
   * - Page route schemaUid → RouteModel (minimal data)
   * - Tabs child schemaUid → RouteModel (minimal data)
   * - BlockGridModel has parentId = tabs schemaUid → Contains full page content with nested subModels
   *
   * We need to find the BlockGridModel and use flowModels:findOne to get the full nested structure.
   */
  async getFlowModelTree(rootUid: string): Promise<FlowModel[]> {
    console.log(`[RouteResolver] getFlowModelTree called for rootUid: ${rootUid}`);

    // First, check if we're getting a RouteModel (minimal) or actual content
    const rootModel = await this.getFlowModelByUid(rootUid);

    if (!rootModel) {
      console.log(`[RouteResolver] Root flowModel not found, trying to find BlockGridModel via parentId`);
      return this.findPageContentByParentId(rootUid);
    }

    console.log(`[RouteResolver] Found root flowModel: use=${rootModel.use}`);

    // If it's a RouteModel with no content, we need to find the actual page content
    if (rootModel.use === 'RouteModel' && !rootModel.subModels) {
      console.log(`[RouteResolver] Root is RouteModel with no subModels, searching for BlockGridModel...`);
      return this.findPageContentByParentId(rootUid);
    }

    // If it's a BlockGridModel or RootPageModel with subModels, extract them
    const allModels: FlowModel[] = [rootModel];
    this.extractSubModels(rootModel, allModels);

    console.log(`[RouteResolver] Total flowModels found: ${allModels.length}`);
    return allModels;
  }

  /**
   * Find page content by looking for BlockGridModel with the given parentId.
   *
   * This handles the case where:
   * - Page route schemaUid points to a RouteModel
   * - Actual content is in a BlockGridModel with parentId = tabs child schemaUid
   */
  private async findPageContentByParentId(schemaUid: string): Promise<FlowModel[]> {
    console.log(`[RouteResolver] findPageContentByParentId called for schemaUid: ${schemaUid}`);

    // First, try to find BlockGridModel directly with this schemaUid as parentId
    let blockGridModel = await this.findBlockGridModelByParentId(schemaUid);

    if (!blockGridModel) {
      // If not found, check for tabs children in desktopRoutes
      console.log(`[RouteResolver] No BlockGridModel found with parentId=${schemaUid}, checking tabs children...`);
      const tabsSchemaUid = await this.getTabsChildSchemaUid(schemaUid);

      if (tabsSchemaUid) {
        console.log(`[RouteResolver] Found tabs child schemaUid: ${tabsSchemaUid}`);
        blockGridModel = await this.findBlockGridModelByParentId(tabsSchemaUid);
      }
    }

    if (!blockGridModel) {
      console.log(`[RouteResolver] No BlockGridModel found for page`);
      return [];
    }

    console.log(`[RouteResolver] Found BlockGridModel: uid=${blockGridModel.uid}`);

    // Extract all subModels from the BlockGridModel
    const allModels: FlowModel[] = [blockGridModel];
    this.extractSubModels(blockGridModel, allModels);

    console.log(`[RouteResolver] Total flowModels found: ${allModels.length}`);
    return allModels;
  }

  /**
   * Find a BlockGridModel with the given parentId by querying all flowModels
   */
  private async findBlockGridModelByParentId(parentId: string): Promise<FlowModel | null> {
    console.log(`[RouteResolver] findBlockGridModelByParentId: looking for parentId=${parentId}`);

    const flowModelRepo = this.db.getRepository('flowModels');

    // Get all flowModels and filter for BlockGridModel with matching parentId
    const allModelsRaw = await flowModelRepo.find({
      limit: 10000,
    });

    // Convert Sequelize models to plain objects
    const allModels = allModelsRaw.map((m: any) => {
      // Use toJSON() to get plain object from Sequelize model
      return typeof m.toJSON === 'function' ? m.toJSON() : m;
    });

    console.log(`[RouteResolver] findBlockGridModelByParentId: found ${allModels.length} total flowModels`);

    // Debug: log first model to verify conversion
    if (allModels.length > 0) {
      console.log(`[RouteResolver] First model after toJSON:`, JSON.stringify(allModels[0], null, 2).substring(0, 200));
    }

    // Look for BlockGridModel with matching parentId
    for (const model of allModels) {
      if (model.use === 'BlockGridModel' && model.parentId === parentId) {
        console.log(`[RouteResolver] Found BlockGridModel: uid=${model.uid}`);
        // Now get the full nested structure via findOne
        return this.getFlowModelByUidWithSubModels(model.uid);
      }
    }

    // Debug: list all BlockGridModels to see their parentIds
    const blockGridModels = allModels.filter((m: any) => m.use === 'BlockGridModel');
    console.log(`[RouteResolver] Found ${blockGridModels.length} BlockGridModels`);
    if (blockGridModels.length > 0) {
      console.log(`[RouteResolver] BlockGridModel parentIds:`, blockGridModels.slice(0, 10).map((m: any) => ({
        uid: m.uid,
        parentId: m.parentId,
      })));
    }

    return null;
  }

  /**
   * Get flowModel with full nested subModels structure
   *
   * The standard repository findOne doesn't return subModels.
   * We need to use the FlowModelRepository's special method or call the action directly.
   */
  private async getFlowModelByUidWithSubModels(uid: string): Promise<FlowModel | null> {
    console.log(`[RouteResolver] getFlowModelByUidWithSubModels: fetching uid=${uid}`);

    const flowModelRepo = this.db.getRepository('flowModels') as any;

    // Try using the FlowModelRepository's toFlowModelJSON method if available
    // This is the method that builds the nested subModels structure
    let model: any = null;

    // First, get the raw model
    const modelRaw = await flowModelRepo.findOne({
      filter: { uid },
    });

    if (!modelRaw) return null;

    // Check if the repository has a toFlowModelJSON method
    if (typeof flowModelRepo.toFlowModelJSON === 'function') {
      console.log(`[RouteResolver] Using FlowModelRepository.toFlowModelJSON`);
      model = await flowModelRepo.toFlowModelJSON(modelRaw);
    } else {
      // Fallback: manually build the nested structure
      console.log(`[RouteResolver] toFlowModelJSON not available, building manually`);
      model = await this.buildFlowModelWithSubModels(uid);
    }

    if (!model) return null;

    console.log(`[RouteResolver] getFlowModelByUidWithSubModels: model use=${model.use}, hasSubModels=${!!model.subModels}`);
    if (model.subModels) {
      console.log(`[RouteResolver] subModels keys:`, Object.keys(model.subModels));
    }

    return model;
  }

  /**
   * Manually build flowModel with nested subModels by querying children
   *
   * Note: parentId is stored in JSON, not as a direct column, so we can't use
   * repository filters. We need to get all models and filter in JS.
   */
  private async buildFlowModelWithSubModels(uid: string, allModelsCache?: any[]): Promise<FlowModel | null> {
    const flowModelRepo = this.db.getRepository('flowModels');

    // Get all models once and cache them for recursive calls
    let allModels = allModelsCache;
    if (!allModels) {
      const allModelsRaw = await flowModelRepo.find({ limit: 10000 });
      allModels = allModelsRaw.map((m: any) => (typeof m.toJSON === 'function' ? m.toJSON() : m));
    }

    // Find the target model
    const model = allModels.find((m: any) => m.uid === uid);
    if (!model) return null;

    // Find all children with this parentId
    const children = allModels.filter((m: any) => m.parentId === uid);

    console.log(`[RouteResolver] buildFlowModelWithSubModels: found ${children.length} children for uid=${uid}`);

    // Group children by subKey
    const subModels: Record<string, any> = {};

    for (const child of children) {
      const subKey = child.subKey || 'items';
      const subType = child.subType || 'array';

      // Recursively build children's subModels (pass the cache)
      const childWithSubModels = await this.buildFlowModelWithSubModels(child.uid, allModels);
      const childData = childWithSubModels || child;

      if (subType === 'array') {
        if (!subModels[subKey]) {
          subModels[subKey] = [];
        }
        subModels[subKey].push(childData);
      } else {
        subModels[subKey] = childData;
      }
    }

    return {
      uid: model.uid,
      name: model.name,
      use: model.use,
      parentId: model.parentId,
      subKey: model.subKey,
      subType: model.subType,
      sortIndex: model.sortIndex,
      stepParams: model.stepParams || {},
      flowRegistry: model.flowRegistry || {},
      subModels: Object.keys(subModels).length > 0 ? subModels : undefined,
    };
  }

  /**
   * Get the schemaUid of the tabs child for a given page schemaUid
   */
  private async getTabsChildSchemaUid(pageSchemaUid: string): Promise<string | null> {
    const routeRepo = this.db.getRepository('desktopRoutes');

    // Find the route with this schemaUid
    const route = await routeRepo.findOne({
      filter: { schemaUid: pageSchemaUid },
    });

    if (!route) {
      console.log(`[RouteResolver] No route found for schemaUid=${pageSchemaUid}`);
      return null;
    }

    // Find tabs children
    const tabsChildren = await routeRepo.find({
      filter: {
        parentId: route.id,
        type: 'tabs',
      },
    });

    if (tabsChildren.length === 0) {
      console.log(`[RouteResolver] No tabs children found for route ${route.id}`);
      return null;
    }

    // Return the first tabs child's schemaUid
    return tabsChildren[0].schemaUid || null;
  }

  /**
   * Get a single flowModel by UID and parse its JSON structure
   */
  private async getFlowModelByUid(uid: string): Promise<FlowModel | null> {
    try {
      const results = await this.db.sequelize.query(
        `SELECT uid, name, options FROM "flowModels" WHERE uid = :uid LIMIT 1`,
        {
          replacements: { uid },
          type: 'SELECT',
        }
      ) as any[];

      if (results.length === 0) return null;

      const row = results[0];
      const options = typeof row.options === 'string' ? JSON.parse(row.options) : row.options;

      // Build FlowModel from the raw data
      return {
        uid: row.uid,
        name: row.name,
        use: options?.use || options?.schema?.use,
        stepParams: options?.stepParams || {},
        flowRegistry: options?.flowRegistry || {},
        subModels: options?.subModels,
        ...options, // Include any other fields
      };
    } catch (err) {
      console.log(`[RouteResolver] Error fetching flowModel ${uid}:`, err);
      return null;
    }
  }

  /**
   * Recursively extract subModels from a flowModel's JSON structure
   */
  private extractSubModels(model: FlowModel, accumulator: FlowModel[]): void {
    if (!model.subModels) return;

    for (const [key, value] of Object.entries(model.subModels)) {
      if (Array.isArray(value)) {
        for (const subModel of value) {
          if (subModel && typeof subModel === 'object') {
            const parsed = this.parseSubModel(subModel, model.uid);
            if (parsed) {
              accumulator.push(parsed);
              this.extractSubModels(parsed, accumulator);
            }
          }
        }
      } else if (value && typeof value === 'object') {
        const parsed = this.parseSubModel(value as any, model.uid);
        if (parsed) {
          accumulator.push(parsed);
          this.extractSubModels(parsed, accumulator);
        }
      }
    }
  }

  /**
   * Parse a subModel object into a FlowModel
   */
  private parseSubModel(obj: any, parentId: string): FlowModel | null {
    if (!obj.uid) return null;

    return {
      uid: obj.uid,
      name: obj.name,
      use: obj.use,
      parentId,
      subKey: obj.subKey,
      subType: obj.subType,
      sortIndex: obj.sortIndex,
      stepParams: obj.stepParams || {},
      flowRegistry: obj.flowRegistry || {},
      subModels: obj.subModels,
    };
  }

  /**
   * Recursive fallback for getting flowModel descendants (via separate DB records)
   * Note: This may not work if flowModels are stored inline in JSON
   */
  private async getFlowModelsRecursive(parentUid: string): Promise<FlowModel[]> {
    console.log(`[RouteResolver] getFlowModelsRecursive called for parentUid: ${parentUid}`);

    // Try using the API approach first - get the flowModel and extract subModels
    const parentModel = await this.getFlowModelByUid(parentUid);
    if (parentModel && parentModel.subModels) {
      const descendants: FlowModel[] = [];
      this.extractSubModels(parentModel, descendants);
      return descendants;
    }

    return [];
  }

  /**
   * Find all pages and their paths
   */
  async getAllPagePaths(): Promise<Array<{ path: string; routeId: number; schemaUid: string }>> {
    const routes = await this.getRoutesTree();
    const pages: Array<{ path: string; routeId: number; schemaUid: string }> = [];

    const traverse = (entries: RouteEntry[], currentPath: string[]) => {
      for (const entry of entries) {
        const newPath = [...currentPath, entry.title];

        if (entry.schemaUid && entry.type !== 'group') {
          pages.push({
            path: newPath.join('/'),
            routeId: entry.id,
            schemaUid: entry.schemaUid,
          });
        }

        if (entry.children && entry.children.length > 0) {
          traverse(entry.children, newPath);
        }
      }
    };

    traverse(routes, []);
    return pages;
  }

  /**
   * Create a new flowPage route with its required tabs child.
   *
   * NocoBase flowPages require this structure:
   * - flowPage route (the menu entry)
   *   - tabs child route (contains the actual page content)
   *
   * Returns both the route ID and the tabs schemaUid (needed for BlockGridModel parent).
   */
  async createRoute(options: {
    title: string;
    parentPath?: string;
    schemaUid: string;
    tabsSchemaUid: string;
    icon?: string;
  }): Promise<{ routeId: number; tabsSchemaUid: string }> {
    const repo = this.db.getRepository('desktopRoutes');

    let parentId: number | null = null;
    let sort = 0;

    // If parent path specified, resolve it (route only, not page content)
    // This allows parent groups that don't have page content
    if (options.parentPath) {
      const parentResolved = await this.resolveRouteByPath(options.parentPath);
      if (!parentResolved) {
        throw new Error(`Parent path not found: ${options.parentPath}`);
      }
      parentId = parentResolved.routeId;

      // Get max sort among siblings
      const siblings = await repo.find({
        filter: { parentId },
      });
      sort = siblings.length > 0 ? Math.max(...siblings.map((s: any) => s.sort || 0)) + 1 : 0;
    } else {
      // Get max sort at root level
      const roots = await repo.find({
        filter: { parentId: null },
      });
      sort = roots.length > 0 ? Math.max(...roots.map((s: any) => s.sort || 0)) + 1 : 0;
    }

    // Generate a separate menuSchemaUid (GUI uses a different UID for menu)
    const menuSchemaUid = generateUid();
    // Generate tabSchemaName for the tabs child
    const tabSchemaName = generateUid();

    // Create the flowPage route (the menu entry)
    // Match the GUI pattern: enableTabs=false, separate menuSchemaUid
    const route = await repo.create({
      values: {
        title: options.title,
        schemaUid: options.schemaUid,
        parentId,
        sort,
        type: 'flowPage',
        icon: options.icon,
        menuSchemaUid,
        enableTabs: false,  // GUI uses false
        hideInMenu: false,
      },
    });

    // Create the tabs child route (required for RootPageModel)
    // Match the GUI pattern: hidden=true, tabSchemaName
    await repo.create({
      values: {
        title: null,
        schemaUid: options.tabsSchemaUid,
        parentId: route.id,
        sort: 0,
        type: 'tabs',
        tabSchemaName,
        hidden: true,  // GUI uses hidden=true (not hideInMenu)
      },
    });

    return { routeId: route.id, tabsSchemaUid: options.tabsSchemaUid };
  }

  /**
   * Delete a route and its children
   */
  async deleteRoute(routeId: number): Promise<void> {
    const repo = this.db.getRepository('desktopRoutes');

    // Get all descendant routes
    const descendants = await this.getDescendantRoutes(routeId);

    // Delete in reverse order (children first)
    for (const route of descendants.reverse()) {
      await repo.destroy({
        filterByTk: route.id,
      });
    }

    // Delete the route itself
    await repo.destroy({
      filterByTk: routeId,
    });
  }

  /**
   * Get all descendant routes
   */
  private async getDescendantRoutes(routeId: number): Promise<Array<{ id: number }>> {
    const repo = this.db.getRepository('desktopRoutes');
    const descendants: Array<{ id: number }> = [];

    const children = await repo.find({
      filter: { parentId: routeId },
    });

    for (const child of children) {
      descendants.push({ id: child.id });
      const childDescendants = await this.getDescendantRoutes(child.id);
      descendants.push(...childDescendants);
    }

    return descendants;
  }

  /**
   * Resolve a path to just the route entry (without page content resolution).
   * Use this when you only need the route ID (e.g., for setting parent routes on groups).
   *
   * Unlike resolveByPath(), this method does NOT try to resolve page content,
   * which allows it to work with groups that don't have flowModel content.
   */
  async resolveRouteByPath(path: string): Promise<{ routeId: number; title: string } | null> {
    console.log(`[RouteResolver] resolveRouteByPath called with path: "${path}"`);

    const pathParts = path.split('/').filter(Boolean);
    if (pathParts.length === 0) return null;

    const routes = await this.getRoutesTree();
    let currentRoutes = routes;
    let targetRoute: RouteEntry | null = null;

    for (const part of pathParts) {
      const found = currentRoutes.find(
        (r) => r.title?.toLowerCase() === part.toLowerCase() || r.path === part
      );
      if (!found) {
        console.log(`[RouteResolver] resolveRouteByPath: part "${part}" not found`);
        return null;
      }

      targetRoute = found;
      currentRoutes = found.children || [];
    }

    if (!targetRoute) return null;

    console.log(`[RouteResolver] resolveRouteByPath: found route id=${targetRoute.id}, title="${targetRoute.title}"`);

    return {
      routeId: targetRoute.id,
      title: targetRoute.title,
    };
  }

  /**
   * Parse a route path into parent path and page title
   */
  parseRoutePath(path: string): { parentPath: string | null; title: string } {
    const parts = path.split('/').filter(Boolean);
    if (parts.length === 0) {
      throw new Error('Empty path');
    }

    if (parts.length === 1) {
      return { parentPath: null, title: parts[0] };
    }

    return {
      parentPath: parts.slice(0, -1).join('/'),
      title: parts[parts.length - 1],
    };
  }
}
