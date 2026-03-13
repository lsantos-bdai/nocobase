import { Context, Next } from '@nocobase/actions';
import { getPlatformOrThrow } from '../utils';
import { parsePaginationParams, buildPaginationMeta } from '../utils/pagination';

export async function viewPlatform(ctx: Context, next: Next) {
  const platformIdentifier = ctx.action.params.platform || ctx.request.query.platform;
  const { page: pageStr, pageSize: pageSizeStr } = ctx.request.query as {
    page?: string;
    pageSize?: string;
  };

  if (!platformIdentifier) {
    ctx.throw(400, 'platform parameter (id or slug) is required');
  }

  const { page, pageSize } = parsePaginationParams(ctx, pageStr, pageSizeStr);

  const platformRecord = await getPlatformOrThrow(ctx, platformIdentifier);
  const lookupRepo = ctx.db.getRepository(platformRecord.collectionName);

  const [entries, count] = await Promise.all([
    lookupRepo.find({
      limit: pageSize,
      offset: (page - 1) * pageSize,
      sort: ['name'],
    }),
    lookupRepo.count(),
  ]);

  ctx.body = {
    data: entries,
    meta: buildPaginationMeta(page, pageSize, count),
  };

  ctx.withoutDataWrapping = true;
  await next();
}
