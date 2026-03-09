import { Context, Next } from '@nocobase/actions';
import { getPlatformOrThrow } from '../utils';

export async function viewPlatform(ctx: Context, next: Next) {
  const platformIdentifier = ctx.action.params.platform || ctx.request.query.platform;
  const { page = 1, pageSize = 50 } = ctx.action.params;

  if (!platformIdentifier) {
    ctx.throw(400, 'platform parameter (id or slug) is required');
  }

  const platformRecord = await getPlatformOrThrow(ctx, platformIdentifier);
  const lookupRepo = ctx.db.getRepository(platformRecord.collectionName);

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
    meta: { page: Number(page), pageSize: Number(pageSize), total },
  };

  ctx.withoutDataWrapping = true;
  await next();
}
