import { Context, Next } from '@nocobase/actions';
import { getPlatformOrThrow } from '../utils';

export async function viewPlatform(ctx: Context, next: Next) {
  const { filterByTk } = ctx.action.params;
  const { page = 1, pageSize = 50 } = ctx.action.params;

  if (!filterByTk) {
    ctx.throw(400, 'filterByTk (platform id) is required');
  }

  const platform = await getPlatformOrThrow(ctx, filterByTk);
  const lookupRepo = ctx.db.getRepository(platform.collectionName);

  const [entries, total] = await Promise.all([
    lookupRepo.find({
      limit: pageSize,
      offset: (page - 1) * pageSize,
      sort: ['name'],
    }),
    lookupRepo.count(),
  ]);

  ctx.body = {
    data: entries,
    meta: { page, pageSize, total },
  };

  await next();
}
