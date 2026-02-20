import { Context, Next } from '@nocobase/actions';

export async function destroyPlatform(ctx: Context, next: Next) {
  const { filterByTk } = ctx.action.params;

  if (!filterByTk) {
    ctx.throw(400, 'filterByTk (platform id) is required');
  }

  // Get platform from directory
  const platform = await ctx.db.getRepository('databridge_platforms').findOne({
    filterByTk,
  });

  if (!platform) {
    ctx.throw(404, 'Platform not found');
  }

  // 1. Remove the platform collection
  await ctx.db.getRepository('collections').destroy({
    filter: { name: platform.collectionName },
  });

  // 2. Remove from directory
  await ctx.db.getRepository('databridge_platforms').destroy({ filterByTk });

  ctx.body = { success: true };
  await next();
}
