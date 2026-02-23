import { Context, Next } from '@nocobase/actions';
import { getPlatformOrThrow } from '../utils';

export async function destroyPlatform(ctx: Context, next: Next) {
  const { filterByTk } = ctx.action.params;

  if (!filterByTk) {
    ctx.throw(400, 'filterByTk (platform id) is required');
  }

  const platform = await getPlatformOrThrow(ctx, filterByTk);

  // 1. Remove the platform collection
  await ctx.db.getRepository('collections').destroy({
    filter: { name: platform.collectionName },
  });

  // 2. Remove from directory
  await ctx.db.getRepository('databridge_platforms').destroy({ filterByTk });

  ctx.body = { success: true };
  await next();
}
