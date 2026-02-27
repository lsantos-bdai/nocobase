/**
 * Export Action
 *
 * GET /api/ui-snapshot:export?path=EngOps/Workstations
 *
 * Exports a single UI page to JSON format.
 *
 * Query parameters:
 * - path: Route path of the page to export (e.g., "EngOps/Workstations")
 *
 * Response:
 * {
 *   "page": {...},
 *   "collections": {...},
 *   "layout": {...},
 *   "blocks": {...},
 *   "path": "EngOps/Workstations"
 * }
 */
import { Context, Next } from '@nocobase/actions';
import { PageExporter } from '../services/page-exporter';
import type { ExportResponse } from '../types';

export async function exportPage(ctx: Context, next: Next) {
  const { path } = ctx.action.params;

  // Validate request
  if (!path) {
    console.log(`[exportPage] Missing path parameter`);
    ctx.throw(400, 'Missing required query parameter: path');
  }

  if (typeof path !== 'string') {
    console.log(`[exportPage] Path is not a string, type: ${typeof path}`);
    ctx.throw(400, 'Parameter path must be a string');
  }

  try {
    console.log(`[exportPage] Creating PageExporter and calling exportByPath("${path}")`);
    const exporter = new PageExporter(ctx.db);
    const config = await exporter.exportByPath(path);

    const response: ExportResponse = {
      ...config,
      path,
    };

    ctx.body = response;
    ctx.withoutDataWrapping = true;
  } catch (err: any) {
    if (err.message?.includes('not found')) {
      ctx.status = 404;
      ctx.body = {
        error: 'Not found',
        message: err.message,
      };
      ctx.withoutDataWrapping = true;
      return next();
    }

    // Re-throw unknown errors
    throw err;
  }

  await next();
}
