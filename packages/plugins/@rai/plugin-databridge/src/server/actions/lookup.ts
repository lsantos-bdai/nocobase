import { Context, Next } from '@nocobase/actions';

export async function lookup(ctx: Context, next: Next) {
  const { platform, asset_name } = ctx.request.query as {
    platform?: string;
    asset_name?: string;
  };

  if (!platform || !asset_name) {
    ctx.throw(400, 'platform and asset_name query parameters are required');
  }

  // 1. Get platform from directory
  const platformRecord = await ctx.db.getRepository('databridge_platforms').findOne({
    filter: { slug: platform },
  });

  if (!platformRecord) {
    ctx.throw(404, `Platform '${platform}' not found`);
  }

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
