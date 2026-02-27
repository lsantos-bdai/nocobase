/**
 * Export All Action
 *
 * GET /api/ui-snapshot:exportAll
 *
 * Exports the entire UI (all pages) to a single JSON snapshot.
 *
 * Response:
 * {
 *   "version": "1.0",
 *   "exported_at": "...",
 *   "collections": {...},
 *   "pages": [...],
 *   "pageCount": 5
 * }
 */
import { Context, Next } from '@nocobase/actions';
import { PageExporter } from '../services/page-exporter';

export async function exportAll(ctx: Context, next: Next) {
  try {
    const exporter = new PageExporter(ctx.db);
    const snapshot = await exporter.exportAllPages();

    ctx.body = {
      ...snapshot,
      pageCount: Array.isArray(snapshot.pages) ? snapshot.pages.length : 0,
    };
    ctx.withoutDataWrapping = true;
  } catch (err: any) {
    ctx.status = 500;
    ctx.body = {
      error: 'Export failed',
      message: err.message,
    };
    ctx.withoutDataWrapping = true;
    return next();
  }

  await next();
}
