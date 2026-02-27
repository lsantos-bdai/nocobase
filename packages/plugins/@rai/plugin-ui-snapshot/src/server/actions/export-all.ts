/**
 * Export All Action
 *
 * GET /api/ui-snapshot:exportAll
 *
 * Exports all UI pages as complete FlowModel snapshots.
 */
import { Context, Next } from '@nocobase/actions';
import { PageExporter } from '../services/page-exporter';

export async function exportAll(ctx: Context, next: Next) {
  const exporter = new PageExporter(ctx.db);
  const snapshot = await exporter.exportAllPages();

  ctx.body = {
    ...snapshot,
    pageCount: snapshot.pages.length,
  };
  ctx.withoutDataWrapping = true;

  await next();
}
