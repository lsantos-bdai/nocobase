/**
 * Create Action
 *
 * POST /api/ui-snapshot:create
 *
 * Creates a UI page from YAML configuration.
 *
 * Request body:
 * {
 *   "yaml": "page:\n  title: ...",
 *   "force": false  // Optional - if true, deletes existing page first
 * }
 *
 * Response:
 * {
 *   "routeId": 123,
 *   "pageUid": "abc123xyz",
 *   "blocksCreated": 3,
 *   "path": "EngOps/Workstations"
 * }
 */
import { Context, Next } from '@nocobase/actions';
import { PageGenerator } from '../services/page-generator';
import type { CreateRequest, CreateResponse } from '../types';

export async function create(ctx: Context, next: Next) {
  const body = ctx.request.body as CreateRequest;

  // Validate request
  if (!body || !body.yaml) {
    ctx.throw(400, 'Missing required field: yaml');
  }

  if (typeof body.yaml !== 'string') {
    ctx.throw(400, 'Field yaml must be a string');
  }

  const force = body.force === true;

  try {
    const generator = new PageGenerator(ctx.db, ctx.app);
    const result = await generator.createFromYaml(body.yaml, { force });

    ctx.body = result;
    ctx.withoutDataWrapping = true;
  } catch (err: any) {
    // Handle specific error types
    if (err.message?.includes('validation failed')) {
      ctx.status = 422;
      ctx.body = {
        error: 'Validation failed',
        message: err.message,
      };
      ctx.withoutDataWrapping = true;
      return next();
    }

    if (err.message?.includes('already exists')) {
      ctx.status = 409;
      ctx.body = {
        error: 'Conflict',
        message: err.message,
      };
      ctx.withoutDataWrapping = true;
      return next();
    }

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
