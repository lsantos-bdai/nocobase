/**
 * Export Action
 *
 * GET /api/ui-snapshot:export?path=EngOps/Workstations
 *
 * Exports a single UI page as a complete FlowModel snapshot.
 */
import { Context, Next } from '@nocobase/actions';
import { PageExporter } from '../services/page-exporter';

export async function exportPage(ctx: Context, next: Next) {
  const { path } = ctx.action.params;

  if (!path || typeof path !== 'string') {
    ctx.throw(400, 'Missing required query parameter: path');
  }

  const exporter = new PageExporter(ctx.db);
  const snapshot = await exporter.exportByPath(path);

  ctx.body = snapshot;
  ctx.withoutDataWrapping = true;

  await next();
}
