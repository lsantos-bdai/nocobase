import { Context, Next } from '@nocobase/actions';
import { Collection } from '@nocobase/database';
import { getPlatformBySlugOrThrow } from '../utils';

/**
 * Normalize a field title to a snake_case key.
 * "Franka Hand Gripper" → "franka_hand_gripper"
 */
function normalizeFieldName(title: string): string {
  return title.toLowerCase().replace(/\s+/g, '_');
}

/**
 * Resolve raw asset data to use human-readable field names and relation values.
 *
 * Transformation rules:
 * 1. Field names: f_nvu6tnxv3sh → normalize(field.options.title) → franka_hand_gripper
 * 2. Relation values: With appends, relations are loaded as full objects → extract "name" field
 * 3. Non-relation values: Keep as-is (just rename the key)
 */
function resolveData(collection: Collection, rawData: Record<string, unknown>): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  const fields = collection.getFields();

  for (const field of fields) {
    const rawValue = rawData[field.name];
    if (rawValue === undefined) continue;

    // Skip auto-generated FK fields (no title, name starts with f_)
    // These are redundant when we have the resolved relation
    const title = field.options?.title;
    if (!title && field.name.startsWith('f_')) continue;

    const key = normalizeFieldName(title || field.name);

    if (field.isRelationField() && rawValue != null) {
      // With appends, rawValue is the full related object (not just an ID)
      if (Array.isArray(rawValue)) {
        // hasMany/belongsToMany - extract names from array
        resolved[key] = rawValue.map((item) => item?.name ?? item);
      } else if (typeof rawValue === 'object' && rawValue !== null) {
        // belongsTo/hasOne - extract name from single object
        resolved[key] = (rawValue as Record<string, unknown>).name ?? rawValue;
      } else {
        resolved[key] = rawValue;
      }
    } else {
      resolved[key] = rawValue;
    }
  }

  return resolved;
}

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

  // 3. Fetch full asset from source collection with relations loaded
  const assetCollection = ctx.db.getCollection(lookupResult.collection);

  // Get relation field names for appends (eagerly load related objects)
  const relationFields = assetCollection
    .getFields()
    .filter((f) => f.isRelationField())
    .map((f) => f.name);

  const asset = await ctx.db.getRepository(lookupResult.collection).findOne({
    filterByTk: lookupResult.assetId,
    appends: relationFields,
  });

  if (!asset) {
    ctx.throw(404, `Asset record not found in collection '${lookupResult.collection}'`);
  }

  // 4. Resolve field names and relation values
  const resolvedData = resolveData(assetCollection, asset);

  ctx.body = {
    platform,
    asset_name,
    collection: lookupResult.collectionTitle || lookupResult.collection,
    data: resolvedData,
  };

  await next();
}
