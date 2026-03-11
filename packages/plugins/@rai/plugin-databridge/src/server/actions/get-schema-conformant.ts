import { Context, Next } from '@nocobase/actions';
import { getSchemaUrl } from '../constants';
import { getPlatformBySlugOrThrow, fetchAssets } from '../utils';

type SchemaEnv = 'prod' | 'dev';

/**
 * Get assets in schema-conformant format with $schema URLs.
 *
 * Returns a flat array of data objects, each with a `$schema` property
 * pointing to the GCS-hosted OpenAPI schema for the asset's collection.
 *
 * The `env` parameter selects the GCS bucket (prod vs dev).
 */
export async function getSchemaConformant(ctx: Context, next: Next) {
  const { platform, asset_name, get_relations, relation_depth, env } = ctx.request.query as {
    platform?: string;
    asset_name?: string | string[];
    get_relations?: string;
    relation_depth?: string;
    env?: string;
  };

  if (!platform || !asset_name) {
    ctx.throw(400, 'platform and asset_name query parameters are required');
  }

  if (!env || (env !== 'prod' && env !== 'dev')) {
    ctx.throw(400, 'env query parameter is required and must be "prod" or "dev"');
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

  // Map env param to the internal response type key used by getSchemaUrl
  const responseType = env === 'prod' ? 'dippy_prod' : 'dippy_dev';

  // Transform to flat array with $schema URLs
  const flatItems = Object.values(result).map((assetResult) => {
    const schemaUrl = getSchemaUrl(responseType, assetResult.collection_title);
    return {
      $schema: schemaUrl,
      ...assetResult.data,
    };
  });

  ctx.body = flatItems;
  ctx.withoutDataWrapping = true;

  await next();
}
