import { Context, Next } from '@nocobase/actions';
import { Collection, Field } from '@nocobase/database';
import { getPlatformBySlugOrThrow, getCollectionTitles } from '../utils';

/**
 * Text field types that support $includes search
 */
const TEXT_FIELD_TYPES = new Set(['string', 'text', 'uid', 'uuid']);

/**
 * Relation field types that can be searched via related record's name
 */
const RELATION_FIELD_TYPES = new Set(['belongsTo', 'hasOne', 'hasMany', 'belongsToMany']);

/**
 * Normalize a field title to a snake_case key.
 * "Franka Hand Gripper" → "franka_hand_gripper"
 */
function normalizeFieldName(title: string): string {
  return title.toLowerCase().replace(/\s+/g, '_');
}

/**
 * Resolve raw asset data to use human-readable field names and relation values.
 */
function resolveData(collection: Collection, rawData: Record<string, unknown>): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  const fields = collection.getFields();

  for (const field of fields) {
    const rawValue = rawData[field.name];
    if (rawValue === undefined) continue;

    // Skip auto-generated FK fields (no title, name starts with f_)
    const title = field.options?.title;
    if (!title && field.name.startsWith('f_')) continue;

    const key = normalizeFieldName(title || field.name);

    if (field.isRelationField() && rawValue != null) {
      if (Array.isArray(rawValue)) {
        resolved[key] = rawValue.map((item) => item?.name ?? item);
      } else if (typeof rawValue === 'object' && rawValue !== null) {
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
 * Check if a field is a searchable text field
 */
function isTextField(field: Field): boolean {
  return TEXT_FIELD_TYPES.has(field.type);
}

/**
 * Check if a field is a relation field
 */
function isRelationField(field: Field): boolean {
  return RELATION_FIELD_TYPES.has(field.type);
}

/**
 * Get the search path for a field.
 * - Text fields: return field name directly
 * - Relation fields: return field.name (to search related record's name)
 * - Others: return null (not searchable)
 */
function getSearchablePath(field: Field): string | null {
  if (isTextField(field)) {
    return field.name;
  }
  if (isRelationField(field)) {
    return `${field.name}.name`;
  }
  return null;
}

/**
 * Build $or filter for searching across all searchable fields in a collection
 */
function buildSearchFilter(collection: Collection, searchTerm: string): object | null {
  const fields = collection.getFields();
  const conditions: object[] = [];

  for (const field of fields) {
    const path = getSearchablePath(field);
    if (path) {
      conditions.push({ [`${path}.$includes`]: searchTerm });
    }
  }

  if (conditions.length === 0) {
    return null;
  }

  return { $or: conditions };
}

interface AssetResult {
  platform: string;
  collection: string;
  collection_title: string;
  data: Record<string, unknown>;
}

/**
 * Search action - searches across all collections (or a specific collection) in a platform
 * for records matching the search term.
 *
 * Query parameters:
 * - platform: Platform slug (required)
 * - q: Search term (required)
 * - collection: Limit search to specific collection (optional)
 * - limit: Max results to return, default 10 (optional)
 * - propertySearch: If true, search across all text fields and relations. If false (default),
 *                   only search asset names in the lookup table.
 */
export async function search(ctx: Context, next: Next) {
  const { platform, q, collection, limit, propertySearch } = ctx.request.query as {
    platform?: string;
    q?: string;
    collection?: string;
    limit?: string;
    propertySearch?: string;
  };

  // Validate required parameters
  if (!platform) {
    ctx.throw(400, 'platform query parameter is required');
  }
  if (!q || q.trim() === '') {
    ctx.throw(400, 'q (search term) query parameter is required');
  }

  const searchTerm = q.trim();
  const maxResults = Math.min(parseInt(limit || '10', 10), 100);
  const doPropertySearch = propertySearch === 'true';

  // Get platform
  const platformRecord = await getPlatformBySlugOrThrow(ctx, platform);
  const registeredCollections: string[] = platformRecord.registeredCollections || [];

  // Resolve collection filter if provided
  let collectionFilter: string | null = null;
  if (collection) {
    // Check if it's already an internal collection name
    if (registeredCollections.includes(collection)) {
      collectionFilter = collection;
    } else {
      // Try to find by title (case-insensitive)
      const collectionLower = collection.toLowerCase();
      const collectionRecords = await ctx.db.getRepository('collections').find({
        filter: { name: { $in: registeredCollections } },
        fields: ['name', 'title'],
      });
      const matchedCollection = collectionRecords.find(
        (c: any) => c.title?.toLowerCase() === collectionLower || c.name.toLowerCase() === collectionLower
      );
      if (!matchedCollection) {
        ctx.throw(404, `Collection '${collection}' not found in platform '${platform}'`);
      }
      collectionFilter = matchedCollection.name;
    }
  }

  const collectionsToSearch = collectionFilter ? [collectionFilter] : registeredCollections;

  if (collectionsToSearch.length === 0) {
    ctx.body = {};
    ctx.withoutDataWrapping = true;
    return next();
  }

  // Get collection titles for response
  const collectionTitles = await getCollectionTitles(ctx.db, collectionsToSearch);

  const result: Record<string, AssetResult> = {};

  if (doPropertySearch) {
    // Property search: search across all text fields and relations in each collection
    let totalFound = 0;

    for (const collectionName of collectionsToSearch) {
      if (totalFound >= maxResults) break;

      const coll = ctx.db.getCollection(collectionName);
      if (!coll) continue;

      // Build search filter for this collection
      const searchFilter = buildSearchFilter(coll, searchTerm);
      if (!searchFilter) continue;

      // Get relation fields for appends
      const relationFields = coll
        .getFields()
        .filter((f) => f.isRelationField())
        .map((f) => f.name);

      // Query with search filter
      const remaining = maxResults - totalFound;
      const assets = await ctx.db.getRepository(collectionName).find({
        filter: searchFilter,
        appends: relationFields,
        limit: remaining,
      });

      // Process results
      for (const asset of assets) {
        if (totalFound >= maxResults) break;

        const assetName = asset.name as string;
        if (!assetName) continue;

        // Skip if we already have this asset (shouldn't happen but be safe)
        if (result[assetName]) continue;

        const resolvedData = resolveData(coll, asset);

        result[assetName] = {
          platform,
          collection: collectionName,
          collection_title: collectionTitles[collectionName] || collectionName,
          data: resolvedData,
        };

        totalFound++;
      }
    }
  } else {
    // Name-only search: search the platform's lookup table for matching asset names
    const lookupFilter: Record<string, unknown> = {
      'name.$includes': searchTerm,
    };

    // Add collection filter if specified
    if (collectionFilter) {
      lookupFilter.collection = collectionFilter;
    }

    // Search the lookup table
    const lookupResults = await ctx.db.getRepository(platformRecord.collectionName).find({
      filter: lookupFilter,
      limit: maxResults,
    });

    // Group by collection for efficient fetching
    const byCollection = new Map<string, typeof lookupResults>();
    for (const lookup of lookupResults) {
      const key = lookup.collection;
      if (!byCollection.has(key)) byCollection.set(key, []);
      byCollection.get(key)!.push(lookup);
    }

    // Fetch full asset data for each collection group
    for (const [collectionName, lookups] of byCollection) {
      const assetIds = lookups.map((l: any) => l.assetId);
      const coll = ctx.db.getCollection(collectionName);
      if (!coll) continue;

      const relationFields = coll
        .getFields()
        .filter((f) => f.isRelationField())
        .map((f) => f.name);

      const assets = await ctx.db.getRepository(collectionName).find({
        filter: { id: { $in: assetIds } },
        appends: relationFields,
      });

      // Build a map from assetId to lookup for quick access
      const lookupByAssetId = new Map<string, (typeof lookups)[0]>();
      for (const lookup of lookups) {
        lookupByAssetId.set(String(lookup.assetId), lookup);
      }

      // Process results
      for (const asset of assets) {
        const assetName = asset.name as string;
        if (!assetName) continue;

        const lookup = lookupByAssetId.get(String(asset.id));
        const resolvedData = resolveData(coll, asset);

        result[assetName] = {
          platform,
          collection: collectionName,
          collection_title: lookup?.collectionTitle || collectionTitles[collectionName] || collectionName,
          data: resolvedData,
        };
      }
    }
  }

  ctx.body = result;
  ctx.withoutDataWrapping = true;
  await next();
}
