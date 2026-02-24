import { Context, Next } from '@nocobase/actions';
import { getPlatformBySlugOrThrow, getCollectionTitles } from '../utils';

/**
 * List action - returns all collections registered in a platform.
 *
 * Query parameters:
 * - platform: Platform slug (required)
 */
export async function list(ctx: Context, next: Next) {
  const { platform } = ctx.request.query as {
    platform?: string;
  };

  if (!platform) {
    ctx.throw(400, 'platform query parameter is required');
  }

  const platformRecord = await getPlatformBySlugOrThrow(ctx, platform);
  const registeredCollections: string[] = platformRecord.registeredCollections || [];

  if (registeredCollections.length === 0) {
    ctx.body = [];
    ctx.withoutDataWrapping = true;
    return next();
  }

  // Get collection titles
  const collectionTitles = await getCollectionTitles(ctx.db, registeredCollections);

  const result = registeredCollections.map((name) => ({
    name,
    title: collectionTitles[name] || name,
  }));

  ctx.body = result;
  ctx.withoutDataWrapping = true;
  await next();
}
