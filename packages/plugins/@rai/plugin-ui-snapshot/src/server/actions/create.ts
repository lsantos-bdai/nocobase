/**
 * Create Action
 *
 * POST /api/ui-snapshot:create
 *
 * Creates a page from a PageSnapshot (same format as export).
 */
import { Context, Next } from '@nocobase/actions';
import type { CreateRequest, CreateResponse } from '../types';
import { RouteResolver } from '../services/route-resolver';
import { generateUid } from '../generators/uid';

export async function create(ctx: Context, next: Next) {
  const body = ctx.request.body as CreateRequest;
  const force = ctx.action.params.force === 'true' || ctx.action.params.force === true;

  if (!body?.flowModels || !body?.rootUid) {
    ctx.throw(400, 'Missing required fields: flowModels, rootUid');
  }

  const routeResolver = new RouteResolver(ctx.db);
  const routePath = body.page?.route || body.page?.title || 'Imported';
  const { parentPath, title } = routeResolver.parseRoutePath(routePath);

  // Check if page exists
  const existing = await routeResolver.resolveByPath(routePath);
  if (existing) {
    if (force) {
      const flowModelRepo = ctx.db.getCollection('flowModels').repository as any;
      await flowModelRepo.remove(existing.pageUid);
      await routeResolver.deleteRoute(existing.routeId);
    } else {
      ctx.throw(409, `Page already exists at path: ${routePath}. Use force=true to overwrite.`);
    }
  }

  // Create route structure
  const schemaUid = generateUid();
  const tabsSchemaUid = generateUid();
  const pageUid = generateUid();

  // Create uiSchema
  const uiSchemaRepo = ctx.db.getRepository('uiSchemas') as any;
  await uiSchemaRepo.insert({
    type: 'void',
    'x-component': 'FlowRoute',
    'x-uid': schemaUid,
  });

  // Create route
  const { routeId } = await routeResolver.createRoute({
    title,
    parentPath: parentPath || undefined,
    schemaUid,
    tabsSchemaUid,
  });

  // Create RootPageModel
  const flowModelRepo = ctx.db.getCollection('flowModels').repository as any;
  await flowModelRepo.upsertModel({
    uid: pageUid,
    async: true,
    parentId: schemaUid,
    subKey: 'page',
    subType: 'object',
    use: 'RootPageModel',
    stepParams: {},
    sortIndex: 0,
    flowRegistry: {},
  });

  // Remap UIDs to avoid conflicts with existing data
  const uidMap = new Map<string, string>();
  for (const oldUid of Object.keys(body.flowModels)) {
    uidMap.set(oldUid, generateUid());
  }

  // Insert all flowModels with remapped UIDs, sorted by sortIndex to preserve order
  let modelsImported = 0;
  const sortedModels = Object.entries(body.flowModels).sort(
    ([, a], [, b]) => ((a as any).sortIndex ?? 0) - ((b as any).sortIndex ?? 0),
  );

  for (const [oldUid, model] of sortedModels) {
    const newUid = uidMap.get(oldUid)!;
    const newParentId = model.parentId ? uidMap.get(model.parentId) || tabsSchemaUid : tabsSchemaUid;

    const remappedModel = remapUids(model, uidMap);
    remappedModel.uid = newUid;
    remappedModel.parentId = newParentId;

    await flowModelRepo.upsertModel(remappedModel);
    modelsImported++;
  }

  const response: CreateResponse = {
    routeId,
    pageUid,
    modelsImported,
    path: routePath,
  };

  ctx.body = response;
  ctx.withoutDataWrapping = true;

  await next();
}

function remapUids(model: any, uidMap: Map<string, string>): any {
  const result = { ...model };

  if (result.uid && uidMap.has(result.uid)) {
    result.uid = uidMap.get(result.uid);
  }
  if (result.parentId && uidMap.has(result.parentId)) {
    result.parentId = uidMap.get(result.parentId);
  }

  if (result.subModels) {
    const newSubModels: Record<string, any> = {};
    for (const [key, value] of Object.entries(result.subModels)) {
      if (Array.isArray(value)) {
        newSubModels[key] = value.map((m: any) => remapUids(m, uidMap));
      } else if (value && typeof value === 'object') {
        newSubModels[key] = remapUids(value, uidMap);
      }
    }
    result.subModels = newSubModels;
  }

  return result;
}
