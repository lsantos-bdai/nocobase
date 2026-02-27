/**
 * Delete Action
 *
 * POST /api/ui-snapshot:delete?path=Parent/PageName
 *
 * Deletes a UI page by its route path.
 */
import { Context, Next } from '@nocobase/actions';
import { RouteResolver } from '../services/route-resolver';
import type { DeleteResponse } from '../types';

export async function deleteAction(ctx: Context, next: Next) {
  const path = ctx.action.params.path as string;

  if (!path || typeof path !== 'string') {
    ctx.throw(400, 'Missing required parameter: path');
  }

  const routeResolver = new RouteResolver(ctx.db);
  const resolved = await routeResolver.resolveByPath(path);

  if (!resolved) {
    ctx.throw(404, `Page not found at path: ${path}`);
  }

  // Delete flowModels
  let flowModelsDeleted = 0;
  try {
    const flowModelRepo = ctx.db.getCollection('flowModels').repository as any;

    // Count descendants before deletion
    const descendants = await ctx.db.sequelize.query(
      `SELECT COUNT(*) as count FROM "flowModelTreePath" WHERE ancestor = :rootUid`,
      { replacements: { rootUid: resolved.pageUid }, type: 'SELECT' }
    ) as Array<{ count: string }>;
    flowModelsDeleted = parseInt(descendants[0]?.count || '0', 10);

    await flowModelRepo.remove(resolved.pageUid);
  } catch (err) {
    console.error('Failed to delete flowModel tree:', err);
  }

  // Delete uiSchema
  try {
    const uiSchemaRepo = ctx.db.getRepository('uiSchemas');
    await uiSchemaRepo.destroy({ filter: { 'x-uid': resolved.schemaUid } });
  } catch {
    // May not exist
  }

  // Delete route
  await routeResolver.deleteRoute(resolved.routeId);

  const response: DeleteResponse = {
    deleted: true,
    path,
    flowModelsDeleted,
  };

  ctx.body = response;
  ctx.withoutDataWrapping = true;

  await next();
}
