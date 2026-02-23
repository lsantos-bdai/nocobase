import { Context, Next } from '@nocobase/actions';
import { getPlatformBySlugOrThrow } from '../utils';

export async function lookup(ctx: Context, next: Next) {
  const { platform, asset_name } = ctx.request.query as {
    platform?: string;
    asset_name?: string;
  };

  if (!platform || !asset_name) {
    ctx.throw(400, 'platform and asset_name query parameters are required');
  }

  // 1. Get platform from directory by slug
  const platformRecord = await getPlatformBySlugOrThrow(ctx, platform);

  // 2. Lookup asset in platform collection (O(1) - name is primary key)
  const lookupRepo = ctx.db.getRepository(platformRecord.collectionName);
  const lookupResult = await lookupRepo.findOne({
    filter: { name: asset_name },
  });

  if (!lookupResult) {
    ctx.throw(404, `Asset '${asset_name}' not found in platform '${platform}'`);
  }

  // 3. Fetch full asset from source collection (O(1) - id is primary key)
  const asset = await ctx.db.getRepository(lookupResult.collection).findOne({
    filterByTk: lookupResult.assetId,
  });

  if (!asset) {
    ctx.throw(404, `Asset record not found in collection '${lookupResult.collection}'`);
  }

  ctx.body = {
    platform,
    asset_name,
    collection: lookupResult.collectionTitle || lookupResult.collection,
    data: asset,
  };

  await next();
}
