/**
 * Route Resolver Service
 *
 * Resolves route paths to NocoBase route IDs, schema UIDs, and page UIDs.
 */
import type { Database } from '@nocobase/database';
import type { ResolvedRoute, RouteEntry, FlowModel } from '../types';
import { generateUid } from '../generators/uid';

export class RouteResolver {
  constructor(private db: Database) {}

  /**
   * Resolve a path like "EngOps/Workstations" to route/schema/page info.
   */
  async resolveByPath(path: string): Promise<ResolvedRoute | null> {
    const pathParts = path.split('/').filter(Boolean);
    if (pathParts.length === 0) return null;

    const routes = await this.getRoutesTree();
    let currentRoutes = routes;
    let targetRoute: RouteEntry | null = null;
    const fullPath: string[] = [];

    for (const part of pathParts) {
      const found = currentRoutes.find(
        (r) => r.title.toLowerCase() === part.toLowerCase() || r.path === part
      );
      if (!found) return null;

      fullPath.push(found.title);
      targetRoute = found;
      currentRoutes = found.children || [];
    }

    if (!targetRoute?.schemaUid) return null;

    const pageInfo = await this.resolvePageFromSchema(targetRoute.schemaUid);
    if (!pageInfo) return null;

    return {
      routeId: targetRoute.id,
      schemaUid: targetRoute.schemaUid,
      pageUid: pageInfo.pageUid,
      title: targetRoute.title,
      path: fullPath.join('/'),
    };
  }

  /**
   * Resolve page UID from schema UID.
   */
  private async resolvePageFromSchema(schemaUid: string): Promise<{ pageUid: string } | null> {
    // Try uiSchemas first
    try {
      const uiSchemaRepo = this.db.getRepository('uiSchemas');
      if (typeof (uiSchemaRepo as any).getJsonSchema === 'function') {
        const schema = await (uiSchemaRepo as any).getJsonSchema(schemaUid);
        if (schema?.['x-component'] === 'FlowRoute' && schema['x-component-props']?.uid) {
          return { pageUid: schema['x-component-props'].uid };
        }
      }
    } catch {
      // Continue with fallback
    }

    return this.getPageUidFromSchema(schemaUid);
  }

  /**
   * Get route tree from desktopRoutes.
   */
  private async getRoutesTree(): Promise<RouteEntry[]> {
    const repo = this.db.getRepository('desktopRoutes');
    const routes = await repo.find({ sort: ['sort'] });
    return this.buildRouteTree(routes);
  }

  private buildRouteTree(routes: any[]): RouteEntry[] {
    const routeMap = new Map<number, RouteEntry>();
    const rootRoutes: RouteEntry[] = [];

    for (const route of routes) {
      routeMap.set(route.id, {
        id: route.id,
        title: route.title,
        path: route.path,
        schemaUid: route.schemaUid,
        type: route.type,
        children: [],
      });
    }

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
   * Fallback: get page UID from schema via database lookups.
   */
  private async getPageUidFromSchema(schemaUid: string): Promise<{ pageUid: string } | null> {
    const flowModelRepo = this.db.getRepository('flowModels');

    // Try RootPageModel with parentId = schemaUid
    try {
      const pageModel = await flowModelRepo.findOne({
        filter: { parentId: schemaUid, use: 'RootPageModel' },
      });
      if (pageModel) return { pageUid: pageModel.uid };
    } catch {}

    // Try BlockGridModel directly under schemaUid
    try {
      const gridModel = await flowModelRepo.findOne({
        filter: { parentId: schemaUid, use: 'BlockGridModel' },
      });
      if (gridModel) return { pageUid: schemaUid };
    } catch {}

    // Check tabs children
    try {
      const routeRepo = this.db.getRepository('desktopRoutes');
      const parentRoute = await routeRepo.findOne({ filter: { schemaUid } });

      if (parentRoute) {
        const tabsChildren = await routeRepo.find({
          filter: { parentId: parentRoute.id, type: 'tabs' },
        });

        for (const tabsChild of tabsChildren) {
          if (tabsChild.schemaUid) {
            const gridInTabs = await flowModelRepo.findOne({
              filter: { parentId: tabsChild.schemaUid, use: 'BlockGridModel' },
            });
            if (gridInTabs) return { pageUid: tabsChild.schemaUid };
          }
        }
      }
    } catch {}

    // Direct flowModel match
    try {
      const directMatch = await flowModelRepo.findOne({ filter: { uid: schemaUid } });
      if (directMatch?.use) return { pageUid: directMatch.uid };
    } catch {}

    // Last resort: use schemaUid as pageUid
    return { pageUid: schemaUid };
  }

  /**
   * Get all flowModels in a page's tree.
   */
  async getFlowModelTree(rootUid: string): Promise<FlowModel[]> {
    const rootModel = await this.getFlowModelByUid(rootUid);

    if (!rootModel) {
      return this.findPageContentByParentId(rootUid);
    }

    if (rootModel.use === 'RouteModel' && !rootModel.subModels) {
      return this.findPageContentByParentId(rootUid);
    }

    const allModels: FlowModel[] = [rootModel];
    this.extractSubModels(rootModel, allModels);
    return allModels;
  }

  private async findPageContentByParentId(schemaUid: string): Promise<FlowModel[]> {
    let blockGridModel = await this.findBlockGridModelByParentId(schemaUid);

    if (!blockGridModel) {
      const tabsSchemaUid = await this.getTabsChildSchemaUid(schemaUid);
      if (tabsSchemaUid) {
        blockGridModel = await this.findBlockGridModelByParentId(tabsSchemaUid);
      }
    }

    if (!blockGridModel) return [];

    const allModels: FlowModel[] = [blockGridModel];
    this.extractSubModels(blockGridModel, allModels);
    return allModels;
  }

  private async findBlockGridModelByParentId(parentId: string): Promise<FlowModel | null> {
    const flowModelRepo = this.db.getRepository('flowModels');
    const allModelsRaw = await flowModelRepo.find({ limit: 1000 });
    const allModels = allModelsRaw.map((m: any) => (typeof m.toJSON === 'function' ? m.toJSON() : m));

    for (const model of allModels) {
      if (model.use === 'BlockGridModel' && model.parentId === parentId) {
        return this.getFlowModelByUidWithSubModels(model.uid);
      }
    }
    return null;
  }

  private async getFlowModelByUidWithSubModels(uid: string): Promise<FlowModel | null> {
    const flowModelRepo = this.db.getRepository('flowModels') as any;
    const modelRaw = await flowModelRepo.findOne({ filter: { uid } });
    if (!modelRaw) return null;

    if (typeof flowModelRepo.toFlowModelJSON === 'function') {
      return flowModelRepo.toFlowModelJSON(modelRaw);
    }
    return this.buildFlowModelWithSubModels(uid);
  }

  private async buildFlowModelWithSubModels(uid: string, allModelsCache?: any[]): Promise<FlowModel | null> {
    const flowModelRepo = this.db.getRepository('flowModels');

    let allModels = allModelsCache;
    if (!allModels) {
      const allModelsRaw = await flowModelRepo.find({ limit: 2000 });
      allModels = allModelsRaw.map((m: any) => (typeof m.toJSON === 'function' ? m.toJSON() : m));
    }

    const model = allModels.find((m: any) => m.uid === uid);
    if (!model) return null;

    const children = allModels.filter((m: any) => m.parentId === uid);
    const subModels: Record<string, any> = {};

    for (const child of children) {
      const subKey = child.subKey || 'items';
      const subType = child.subType || 'array';
      const childWithSubModels = await this.buildFlowModelWithSubModels(child.uid, allModels);
      const childData = childWithSubModels || child;

      if (subType === 'array') {
        if (!subModels[subKey]) subModels[subKey] = [];
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

  private async getTabsChildSchemaUid(pageSchemaUid: string): Promise<string | null> {
    const routeRepo = this.db.getRepository('desktopRoutes');
    const route = await routeRepo.findOne({ filter: { schemaUid: pageSchemaUid } });
    if (!route) return null;

    const tabsChildren = await routeRepo.find({
      filter: { parentId: route.id, type: 'tabs' },
    });

    return tabsChildren[0]?.schemaUid || null;
  }

  private async getFlowModelByUid(uid: string): Promise<FlowModel | null> {
    try {
      const results = await this.db.sequelize.query(
        `SELECT uid, name, options FROM "flowModels" WHERE uid = :uid LIMIT 1`,
        { replacements: { uid }, type: 'SELECT' }
      ) as any[];

      if (results.length === 0) return null;

      const row = results[0];
      const options = typeof row.options === 'string' ? JSON.parse(row.options) : row.options;

      return {
        uid: row.uid,
        name: row.name,
        use: options?.use || options?.schema?.use,
        stepParams: options?.stepParams || {},
        flowRegistry: options?.flowRegistry || {},
        subModels: options?.subModels,
        ...options,
      };
    } catch {
      return null;
    }
  }

  private extractSubModels(model: FlowModel, accumulator: FlowModel[]): void {
    if (!model.subModels) return;

    for (const [, value] of Object.entries(model.subModels)) {
      if (Array.isArray(value)) {
        for (const subModel of value) {
          if (subModel?.uid) {
            accumulator.push(subModel);
            this.extractSubModels(subModel, accumulator);
          }
        }
      } else if (value?.uid) {
        accumulator.push(value);
        this.extractSubModels(value, accumulator);
      }
    }
  }

  /**
   * Get all pages and their paths.
   */
  async getAllPagePaths(): Promise<Array<{ path: string; routeId: number; schemaUid: string }>> {
    const routes = await this.getRoutesTree();
    const pages: Array<{ path: string; routeId: number; schemaUid: string }> = [];

    const traverse = (entries: RouteEntry[], currentPath: string[]) => {
      for (const entry of entries) {
        const newPath = [...currentPath, entry.title];
        if (entry.schemaUid && entry.type !== 'group') {
          pages.push({ path: newPath.join('/'), routeId: entry.id, schemaUid: entry.schemaUid });
        }
        if (entry.children?.length) {
          traverse(entry.children, newPath);
        }
      }
    };

    traverse(routes, []);
    return pages;
  }

  /**
   * Create a flowPage route with tabs child.
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

    if (options.parentPath) {
      const parentResolved = await this.resolveRouteByPath(options.parentPath);
      if (!parentResolved) throw new Error(`Parent path not found: ${options.parentPath}`);
      parentId = parentResolved.routeId;

      const siblings = await repo.find({ filter: { parentId } });
      sort = siblings.length > 0 ? Math.max(...siblings.map((s: any) => s.sort || 0)) + 1 : 0;
    } else {
      const roots = await repo.find({ filter: { parentId: null } });
      sort = roots.length > 0 ? Math.max(...roots.map((s: any) => s.sort || 0)) + 1 : 0;
    }

    const menuSchemaUid = generateUid();
    const tabSchemaName = generateUid();

    const route = await repo.create({
      values: {
        title: options.title,
        schemaUid: options.schemaUid,
        parentId,
        sort,
        type: 'flowPage',
        icon: options.icon,
        menuSchemaUid,
        enableTabs: false,
        hideInMenu: false,
      },
    });

    await repo.create({
      values: {
        title: null,
        schemaUid: options.tabsSchemaUid,
        parentId: route.id,
        sort: 0,
        type: 'tabs',
        tabSchemaName,
        hidden: true,
      },
    });

    return { routeId: route.id, tabsSchemaUid: options.tabsSchemaUid };
  }

  /**
   * Delete a route and its children.
   */
  async deleteRoute(routeId: number): Promise<void> {
    const repo = this.db.getRepository('desktopRoutes');
    const descendants = await this.getDescendantRoutes(routeId);

    for (const route of descendants.reverse()) {
      await repo.destroy({ filterByTk: route.id });
    }
    await repo.destroy({ filterByTk: routeId });
  }

  private async getDescendantRoutes(routeId: number): Promise<Array<{ id: number }>> {
    const repo = this.db.getRepository('desktopRoutes');
    const descendants: Array<{ id: number }> = [];
    const children = await repo.find({ filter: { parentId: routeId } });

    for (const child of children) {
      descendants.push({ id: child.id });
      const childDescendants = await this.getDescendantRoutes(child.id);
      descendants.push(...childDescendants);
    }

    return descendants;
  }

  /**
   * Resolve path to route only (without page content).
   */
  private async resolveRouteByPath(path: string): Promise<{ routeId: number; title: string } | null> {
    const pathParts = path.split('/').filter(Boolean);
    if (pathParts.length === 0) return null;

    const routes = await this.getRoutesTree();
    let currentRoutes = routes;
    let targetRoute: RouteEntry | null = null;

    for (const part of pathParts) {
      const found = currentRoutes.find(
        (r) => r.title?.toLowerCase() === part.toLowerCase() || r.path === part
      );
      if (!found) return null;
      targetRoute = found;
      currentRoutes = found.children || [];
    }

    return targetRoute ? { routeId: targetRoute.id, title: targetRoute.title } : null;
  }

  /**
   * Parse route path into parent and title.
   */
  parseRoutePath(path: string): { parentPath: string | null; title: string } {
    const parts = path.split('/').filter(Boolean);
    if (parts.length === 0) throw new Error('Empty path');
    if (parts.length === 1) return { parentPath: null, title: parts[0] };
    return { parentPath: parts.slice(0, -1).join('/'), title: parts[parts.length - 1] };
  }
}
