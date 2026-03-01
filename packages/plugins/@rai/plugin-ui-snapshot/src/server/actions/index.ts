/**
 * Action Handlers
 *
 * Simple action handlers for the UI Snapshot plugin.
 */
import type { Context, Next } from '@nocobase/actions';
import { Exporter } from '../services/exporter';
import { Importer } from '../services/importer';
import { RouteResolver } from '../services/route-resolver';

/**
 * Export a page to Recipe format
 *
 * GET /api/ui-snapshot:export?path=EngOps/Workstations
 */
export async function exportPage(ctx: Context, next: Next) {
  const { path } = ctx.action.params;

  if (!path) {
    ctx.throw(400, 'Missing required parameter: path');
  }

  const exporter = new Exporter(ctx.db);
  const recipe = await exporter.export(path);

  ctx.body = recipe;

  await next();
}

/**
 * Create a page from Recipe format
 *
 * POST /api/ui-snapshot:create
 * Body: Recipe JSON with optional force=true
 */
export async function create(ctx: Context, next: Next) {
  const rawBody = ctx.request.body as any;

  // Handle both direct recipe and wrapped { data: recipe } format
  const body = rawBody.data || rawBody;

  if (!body.page || !body.layout || !body.blocks) {
    ctx.throw(400, 'Invalid Recipe format: missing page, layout, or blocks');
  }

  const importer = new Importer(ctx.db, ctx.app);
  const result = await importer.import(body, { force: rawBody.force ?? body.force });

  ctx.body = result;

  await next();
}

/**
 * Delete a page by path
 *
 * POST /api/ui-snapshot:delete
 * Body: { path: "EngOps/Workstations" }
 */
export async function deleteAction(ctx: Context, next: Next) {
  const { path } = ctx.request.body as any;

  if (!path) {
    ctx.throw(400, 'Missing required parameter: path');
  }

  const routeResolver = new RouteResolver(ctx.db);
  const resolved = await routeResolver.resolveByPath(path);

  if (!resolved) {
    ctx.throw(404, `Page not found: ${path}`);
  }

  // Delete route (cascades to children)
  await routeResolver.deleteRoute(resolved.routeId);

  // Delete flowModels
  const flowModelRepo = ctx.db.getRepository('flowModels') as any;

  // Use FlowModelRepository's remove method if available (handles tree deletion)
  if (typeof flowModelRepo.remove === 'function') {
    await flowModelRepo.remove(resolved.pageUid);
  } else {
    // Fallback: delete by uid - this may not delete descendants
    try {
      await flowModelRepo.destroy({ filterByTk: resolved.pageUid });
    } catch {
      // Ignore if model doesn't exist
    }
  }

  ctx.body = {
    deleted: true,
    path,
    message: `Page deleted: ${path}`,
  };

  await next();
}

/**
 * Export all pages to Recipe format
 *
 * GET /api/ui-snapshot:exportAll
 */
export async function exportAll(ctx: Context, next: Next) {
  const routeResolver = new RouteResolver(ctx.db);
  const exporter = new Exporter(ctx.db);

  const allPages = await routeResolver.getAllPagePaths();
  const recipes: Array<{ path: string; recipe: any; error?: string }> = [];

  for (const page of allPages) {
    try {
      const recipe = await exporter.export(page.path);
      recipes.push({ path: page.path, recipe });
    } catch (err: any) {
      recipes.push({
        path: page.path,
        recipe: null,
        error: err.message,
      });
    }
  }

  ctx.body = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    pages: recipes,
  };

  await next();
}
