/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * List Pages Action
 *
 * GET /api/ui-snapshot:listPages
 *
 * Returns all routable page paths with their route IDs and schema UIDs.
 */
import { Context, Next } from '@nocobase/actions';
import { PageExporter } from '../services/page-exporter';

export async function listPages(ctx: Context, next: Next) {
  const exporter = new PageExporter(ctx.db);
  const pages = await exporter.getAllPagePaths();

  ctx.body = { pages };
  ctx.withoutDataWrapping = true;

  await next();
}
