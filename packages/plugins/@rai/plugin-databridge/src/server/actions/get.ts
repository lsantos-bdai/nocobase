import { Context, Next } from '@nocobase/actions';
import { getPlatformBySlugOrThrow, fetchAssets } from '../utils';

export async function get(ctx: Context, next: Next) {
  const { platform, asset_name, get_relations, relation_depth } = ctx.request.query as {
    platform?: string;
    asset_name?: string | string[];
    get_relations?: string;
    relation_depth?: string;
  };

  if (!platform || !asset_name) {
    ctx.throw(400, 'platform and asset_name query parameters are required');
  }

  // Normalize asset_name to array
  const assetNames = Array.isArray(asset_name) ? asset_name : [asset_name];
  const getRelations = get_relations === 'true';
  const relationDepth = parseInt(relation_depth || '1', 10);

  // Get platform from directory by slug
  const platformRecord = await getPlatformBySlugOrThrow(ctx, platform);

  const result = await fetchAssets(ctx.db, platformRecord, platform, assetNames, {
    getRelations,
    relationDepth,
  });

  ctx.body = result;
  ctx.withoutDataWrapping = true;

  await next();
}
