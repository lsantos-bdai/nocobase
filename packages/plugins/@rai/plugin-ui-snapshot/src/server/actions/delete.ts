/**
 * Delete Action
 *
 * POST /api/ui-snapshot:delete
 *
 * Deletes a UI page by its route path.
 *
 * Request body:
 * {
 *   "path": "EngOps/Workstations"
 * }
 *
 * Response:
 * {
 *   "deleted": true,
 *   "path": "EngOps/Workstations",
 *   "flowModelsDeleted": 15
 * }
 */
import { Context, Next } from '@nocobase/actions';
import { PageGenerator } from '../services/page-generator';
import type { DeleteRequest, DeleteResponse } from '../types';

export async function deleteAction(ctx: Context, next: Next) {
  const body = ctx.request.body as DeleteRequest;

  // Validate request
  if (!body || !body.path) {
    ctx.throw(400, 'Missing required field: path');
  }

  if (typeof body.path !== 'string') {
    ctx.throw(400, 'Field path must be a string');
  }

  try {
    const generator = new PageGenerator(ctx.db, ctx.app);
    const result = await generator.deleteByPath(body.path);

    const response: DeleteResponse = {
      deleted: result.deleted,
      path: body.path,
      flowModelsDeleted: result.flowModelsDeleted,
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
