import { Context, Next } from '@nocobase/actions';
import { getPlatformOrThrow } from '../utils';

export async function destroyPlatform(ctx: Context, next: Next) {
  const platformIdentifier = ctx.action.params.platform || ctx.action.params.filterByTk;

  if (!platformIdentifier) {
    ctx.throw(400, 'platform parameter (id or slug) is required');
  }

  const platformRecord = await getPlatformOrThrow(ctx, platformIdentifier);

  // 1. Remove the platform collection
  await ctx.db.getRepository('collections').destroy({
    filter: { name: platformRecord.collectionName },
  });

  // 2. Remove from directory
  await ctx.db.getRepository('databridge_platforms').destroy({ filterByTk: platformRecord.id });

  ctx.body = { success: true };
  ctx.withoutDataWrapping = true;
  await next();
}
