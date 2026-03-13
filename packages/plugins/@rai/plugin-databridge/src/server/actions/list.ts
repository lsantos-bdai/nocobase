import { Context, Next } from '@nocobase/actions';
import { getPlatformBySlugOrThrow, getCollectionTitles } from '../utils';
import { parsePaginationParams, buildPaginatedMeta } from '../utils/pagination';

/**
 * List action - returns collections registered in a platform (paginated).
 *
 * Query parameters:
 * - platform: Platform slug (required)
 * - page: Page number (default 1)
 * - pageSize: Items per page (default 50, max 300)
 *
 * Response: { data: [{ name, title }], meta: { page, pageSize, count, totalPage } }
 */
export async function list(ctx: Context, next: Next) {
  const { platform, page: pageStr, pageSize: pageSizeStr } = ctx.request.query as {
    platform?: string;
    page?: string;
    pageSize?: string;
  };

  if (!platform) {
    ctx.throw(400, 'platform query parameter is required');
  }

  const { page, pageSize } = parsePaginationParams(ctx, pageStr, pageSizeStr);

  const platformRecord = await getPlatformBySlugOrThrow(ctx, platform);
  const registeredCollections: string[] = platformRecord.registeredCollections || [];

  const count = registeredCollections.length;

  if (count === 0) {
    ctx.body = {
      data: [],
      meta: buildPaginatedMeta(page, pageSize, 0),
    };
    ctx.withoutDataWrapping = true;
    return next();
  }

  // Get collection titles
  const collectionTitles = await getCollectionTitles(ctx.db, registeredCollections);

  // Apply pagination to the registered collections list
  const offset = (page - 1) * pageSize;
  const pageSlice = registeredCollections.slice(offset, offset + pageSize);

  const data = pageSlice.map((name) => ({
    name,
    title: collectionTitles[name] || name,
  }));

  ctx.body = {
    data,
    meta: buildPaginatedMeta(page, pageSize, count),
  };
  ctx.withoutDataWrapping = true;
  await next();
}
