/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * Export Action
 *
 * GET /api/ui-snapshot:export?path=EngOps/Workstations
 * GET /api/ui-snapshot:export?debug=true  (list available routes)
 *
 * Exports a single UI page as a complete FlowModel snapshot.
 */
import { Context, Next } from '@nocobase/actions';
import { PageExporter } from '../services/page-exporter';

export async function exportPage(ctx: Context, next: Next) {
  const { path, debug } = ctx.action.params;

  const exporter = new PageExporter(ctx.db);

  if (debug) {
    const paths = await exporter.getAllPagePaths();
    ctx.body = { availablePaths: paths.map((p) => p.path) };
    ctx.withoutDataWrapping = true;
    return next();
  }

  if (!path || typeof path !== 'string') {
    ctx.throw(400, 'Missing required query parameter: path');
  }

  const snapshot = await exporter.exportByPath(path);

  ctx.body = snapshot;
  ctx.withoutDataWrapping = true;

  await next();
}
