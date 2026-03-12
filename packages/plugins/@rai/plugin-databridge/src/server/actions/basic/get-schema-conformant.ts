import { Context, Next } from '@nocobase/actions';
import { getSchemaUrl } from '../../constants';
import { resolveCollectionBasic } from '../../utils/resolve-collection-basic';
import { fetchAssetsBasic } from '../../utils/fetch-assets-basic';
import { RelationDescriptor } from '../../types/basic-asset-payload';

/**
 * Get assets in schema-conformant format (platform-free).
 *
 * Returns a flat array of data objects, each with a `$schema` property pointing
 * to the GCS-hosted schema YAML. Relation fields show name strings (like the
 * platform API does), falling back to stringified IDs if no name field.
 *
 * Query parameters:
 * - collection: Collection name or title (required, case-insensitive)
 * - filter: JSON filter object (required)
 * - env: "prod" or "dev" (required) — selects GCS bucket
 * - get_relations: If true, include related records in the output
 * - relation_depth: How deep to traverse relations (default 1)
 *
 * Response: list[{ $schema, ...data }]
 */
export async function basicGetSchemaConformant(ctx: Context, next: Next) {
  const { collection, filter, env, get_relations, relation_depth } = ctx.request.query as {
    collection?: string;
    filter?: string;
    env?: string;
    get_relations?: string;
    relation_depth?: string;
  };

  if (!collection) {
    ctx.throw(400, 'collection query parameter is required');
  }

  if (!filter) {
    ctx.throw(400, 'filter query parameter is required');
  }

  if (!env || (env !== 'prod' && env !== 'dev')) {
    ctx.throw(400, 'env query parameter is required and must be "prod" or "dev"');
  }

  // Parse JSON filter
  let parsedFilter: Record<string, unknown>;
  try {
    parsedFilter = JSON.parse(filter);
  } catch {
    ctx.throw(400, 'filter must be valid JSON');
    return;
  }

  if (typeof parsedFilter !== 'object' || parsedFilter === null || Array.isArray(parsedFilter)) {
    ctx.throw(400, 'filter must be a JSON object');
  }

  const getRelations = get_relations === 'true';
  const relationDepth = parseInt(relation_depth || '1', 10);

  // Resolve collection
  const collectionName = await resolveCollectionBasic(ctx, ctx.db, collection);

  // Fetch assets with relation descriptors
  const assets = await fetchAssetsBasic(ctx.db, collectionName, parsedFilter, {
    getRelations,
    relationDepth,
  });

  // Map env to internal response type key
  const responseType = env === 'prod' ? 'dippy_prod' : 'dippy_dev';

  // Transform to flat schema-conformant format
  const flatItems = assets.map((asset) => {
    const schemaUrl = getSchemaUrl(responseType, asset.collection_title || asset.collection);

    // Flatten relation descriptors to name strings (or stringified IDs)
    const flatData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(asset.data)) {
      if (isRelationDescriptor(value)) {
        const desc = value as RelationDescriptor;
        if (desc.name.length > 0) {
          // Use names — single value for belongsTo, array for hasMany
          flatData[key] = desc.id.length === 1 ? desc.name[0] : desc.name;
        } else {
          // Fallback to stringified IDs
          const stringIds = desc.id.map(String);
          flatData[key] = desc.id.length === 1 ? stringIds[0] : stringIds;
        }
      } else {
        flatData[key] = value;
      }
    }

    return {
      $schema: schemaUrl,
      ...flatData,
    };
  });

  ctx.body = flatItems;
  ctx.withoutDataWrapping = true;

  await next();
}

/**
 * Check if a value is a RelationDescriptor.
 */
function isRelationDescriptor(value: unknown): value is RelationDescriptor {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.collection === 'string' && Array.isArray(obj.id);
}
