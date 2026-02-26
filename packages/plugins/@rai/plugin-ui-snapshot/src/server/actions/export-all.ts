/**
 * Export All Action
 *
 * GET /api/ui-snapshot:exportAll
 *
 * Exports the entire UI (all pages) to a single YAML snapshot.
 *
 * Response:
 * {
 *   "yaml": "version: '1.0'\nexported_at: ...",
 *   "pageCount": 5
 * }
 */
import { Context, Next } from '@nocobase/actions';
import { PageExporter } from '../services/page-exporter';

export async function exportAll(ctx: Context, next: Next) {
  try {
    const exporter = new PageExporter(ctx.db);
    const yaml = await exporter.exportAllPages();

    // Count pages in the export
    const pageCount = (yaml.match(/^  - page:/gm) || []).length;

    ctx.body = {
      yaml,
      pageCount,
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
