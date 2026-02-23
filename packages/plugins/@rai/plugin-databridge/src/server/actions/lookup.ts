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

/**
 * Extract potential relation names from resolved data.
 * Looks for string values and string arrays that could be asset names.
 */
function extractRelationNames(data: Record<string, unknown>): string[] {
  const names: string[] = [];
  for (const value of Object.values(data)) {
    if (typeof value === 'string' && value) {
      names.push(value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string' && item) {
          names.push(item);
        }
      }
    }
  }
  return names;
}

interface QueueItem {
  name: string;
  depth: number;
}

interface AssetResult {
  platform: string;
  collection: string;
  collection_title: string;
  data: Record<string, unknown>;
}

export async function lookup(ctx: Context, next: Next) {
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

  const visited = new Set<string>();
  const result: Record<string, AssetResult> = {};
  const queue: QueueItem[] = assetNames.map((name) => ({ name, depth: 0 }));

  while (queue.length > 0) {
    // Collect batch of unvisited names at the same depth level
    const currentDepth = queue[0].depth;
    const batch: string[] = [];

    while (queue.length > 0 && queue[0].depth === currentDepth) {
      const item = queue.shift()!;
      if (!visited.has(item.name)) {
        batch.push(item.name);
        visited.add(item.name);
      }
    }

    if (batch.length === 0) continue;

    // Batch lookup all names in platform's lookup table
    const lookupResults = await ctx.db.getRepository(platformRecord.collectionName).find({
      filter: { name: { $in: batch } },
    });

    // Group by collection for efficient fetching
    const byCollection = new Map<string, typeof lookupResults>();
    for (const lookup of lookupResults) {
      const key = lookup.collection;
      if (!byCollection.has(key)) byCollection.set(key, []);
      byCollection.get(key)!.push(lookup);
    }

    // Batch fetch each collection group
    for (const [collectionName, lookups] of byCollection) {
      const assetIds = lookups.map((l) => l.assetId);
      const collection = ctx.db.getCollection(collectionName);
      const relationFields = collection
        .getFields()
        .filter((f) => f.isRelationField())
        .map((f) => f.name);

      // Single batch query per collection with eager-loaded relations
      const assets = await ctx.db.getRepository(collectionName).find({
        filter: { id: { $in: assetIds } },
        appends: relationFields,
      });

      // Build a map from assetId to lookup for quick access
      // Note: assetId is stored as string in DB, but asset.id is a number, so normalize to string
      const lookupByAssetId = new Map<string, (typeof lookups)[0]>();
      for (const lookup of lookups) {
        lookupByAssetId.set(String(lookup.assetId), lookup);
      }

      // Process results
      for (const asset of assets) {
        const resolvedData = resolveData(collection, asset);
        const assetName = asset.name as string;
        const lookup = lookupByAssetId.get(String(asset.id));

        result[assetName] = {
          platform,
          collection: collectionName,
          collection_title: lookup?.collectionTitle || collectionName,
          data: resolvedData,
        };

        // Queue relations if enabled and not at max depth
        if (getRelations && currentDepth < relationDepth) {
          const relationNames = extractRelationNames(resolvedData);
          for (const relName of relationNames) {
            if (!visited.has(relName)) {
              queue.push({ name: relName, depth: currentDepth + 1 });
            }
          }
        }
      }
    }
  }

  ctx.body = result;
  await next();
}
