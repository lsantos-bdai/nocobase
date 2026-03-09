import { Context, Next } from '@nocobase/actions';
import { getPlatformOrThrow } from '../utils';

export async function getPlatform(ctx: Context, next: Next) {
  const platformIdentifier = ctx.action.params.platform || ctx.request.query.platform;

  if (!platformIdentifier) {
    ctx.throw(400, 'platform parameter (id or slug) is required');
  }

  const platformRecord = await getPlatformOrThrow(ctx, platformIdentifier);

  ctx.body = platformRecord;
  ctx.withoutDataWrapping = true;
  await next();
}
