import { Context, Next } from '@nocobase/actions';
import { Collection, Field } from '@nocobase/database';
import { getPlatformBySlugOrThrow, getCollectionTitles, resolveCollection, resolveDataPlatform } from '../utils';
import { parsePaginationParams, buildPaginatedMeta } from '../utils/pagination';

/**
 * Text field types that support $includes search
 */
const TEXT_FIELD_TYPES = new Set(['string', 'text', 'uid', 'uuid']);

/**
 * Relation field types that can be searched via related record's name
 */
const RELATION_FIELD_TYPES = new Set(['belongsTo', 'hasOne', 'hasMany', 'belongsToMany']);

/**
 * Get the search path for a field.
 * - Text fields: return field name directly
 * - Relation fields: return field.name (to search related record's name)
 * - Others: return null (not searchable)
 */
function getSearchablePath(field: Field): string | null {
  if (TEXT_FIELD_TYPES.has(field.type)) {
    return field.name;
  }
  if (RELATION_FIELD_TYPES.has(field.type)) {
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
 * Two search modes:
 * - Name-only (default): Searches asset names in the platform's lookup table.
 * - Property search (propertySearch=true): Searches across all text fields and relations
 *   in each collection.
 *
 * Both modes use page/pageSize pagination.
 *
 * Query parameters:
 * - platform: Platform slug (required)
 * - q: Search term (required)
 * - collection: Limit search to specific collection (optional)
 * - page: Page number (default 1)
 * - pageSize: Items per page (default 50, max 300)
 * - propertySearch: If true, search across all text fields and relations. If false (default),
 *                   only search asset names in the lookup table.
 *
 * Response: { data: AssetPayloadMap, meta: { page, pageSize, count, totalPage } }
 */
export async function search(ctx: Context, next: Next) {
  const { platform, q, collection, page: pageStr, pageSize: pageSizeStr, propertySearch } = ctx.request.query as {
    platform?: string;
    q?: string;
    collection?: string;
    page?: string;
    pageSize?: string;
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
  const { page, pageSize } = parsePaginationParams(ctx, pageStr, pageSizeStr);
  const doPropertySearch = propertySearch === 'true';

  // Get platform
  const platformRecord = await getPlatformBySlugOrThrow(ctx, platform);
  const registeredCollections: string[] = platformRecord.registeredCollections || [];

  // Resolve collection filter if provided
  let collectionFilter: string | null = null;
  if (collection) {
    collectionFilter = await resolveCollection(ctx, platformRecord, collection);
  }

  const collectionsToSearch = collectionFilter ? [collectionFilter] : registeredCollections;

  if (collectionsToSearch.length === 0) {
    ctx.body = {
      data: {},
      meta: buildPaginatedMeta(page, pageSize, 0),
    };
    ctx.withoutDataWrapping = true;
    return next();
  }

  if (doPropertySearch) {
    await propertySearchPaginated(ctx, platform, platformRecord, collectionsToSearch, searchTerm, page, pageSize);
  } else {
    await nameSearchPaginated(ctx, platform, platformRecord, collectionsToSearch, searchTerm, collectionFilter, page, pageSize);
  }

  ctx.withoutDataWrapping = true;
  await next();
}

/**
 * Name-only search with pagination.
 * Queries the platform's lookup table for matching asset names.
 */
async function nameSearchPaginated(
  ctx: Context,
  platformSlug: string,
  platformRecord: { collectionName: string },
  collectionsToSearch: string[],
  searchTerm: string,
  collectionFilter: string | null,
  page: number,
  pageSize: number,
) {
  const lookupFilter: Record<string, unknown> = {
    'name.$includes': searchTerm,
  };

  // Add collection filter if specified
  if (collectionFilter) {
    lookupFilter.collection = collectionFilter;
  }

  const lookupRepo = ctx.db.getRepository(platformRecord.collectionName);
  const offset = (page - 1) * pageSize;

  // Count + page fetch in parallel
  const [lookupResults, totalCount] = await Promise.all([
    lookupRepo.find({
      filter: lookupFilter as any,
      limit: pageSize,
      offset,
    }),
    lookupRepo.count({ filter: lookupFilter as any }),
  ]);

  if (lookupResults.length === 0) {
    ctx.body = {
      data: {},
      meta: buildPaginatedMeta(page, pageSize, totalCount),
    };
    return;
  }

  // Group by collection for efficient fetching
  const byCollection = new Map<string, typeof lookupResults>();
  for (const lookup of lookupResults) {
    const key = lookup.collection;
    if (!byCollection.has(key)) byCollection.set(key, []);
    byCollection.get(key)!.push(lookup);
  }

  // Get collection titles
  const allCollections = [...byCollection.keys()];
  const collectionTitles = await getCollectionTitles(ctx.db, allCollections);

  // Fetch full asset data for each collection group
  const result: Record<string, AssetResult> = {};

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
      const resolvedData = resolveDataPlatform(coll, asset);

      result[assetName] = {
        platform: platformSlug,
        collection: collectionName,
        collection_title: lookup?.collectionTitle || collectionTitles[collectionName] || collectionName,
        data: resolvedData,
      };
    }
  }

  ctx.body = {
    data: result,
    meta: buildPaginatedMeta(page, pageSize, totalCount),
  };
}

/**
 * Property search with pagination across multiple collections.
 *
 * Two-pass approach:
 * 1. Count matching records per collection to compute total and locate the page window.
 * 2. Fetch only the records that fall within the current page window.
 */
async function propertySearchPaginated(
  ctx: Context,
  platformSlug: string,
  platformRecord: { collectionName: string },
  collectionsToSearch: string[],
  searchTerm: string,
  page: number,
  pageSize: number,
) {
  // Pass 1: Count matches per collection (lightweight)
  const collectionCounts: { collectionName: string; filter: object; count: number }[] = [];
  let totalCount = 0;

  for (const collectionName of collectionsToSearch) {
    const coll = ctx.db.getCollection(collectionName);
    if (!coll) continue;

    const searchFilter = buildSearchFilter(coll, searchTerm);
    if (!searchFilter) continue;

    const count = await ctx.db.getRepository(collectionName).count({ filter: searchFilter as any });
    if (count > 0) {
      collectionCounts.push({ collectionName, filter: searchFilter, count });
      totalCount += count;
    }
  }

  if (totalCount === 0) {
    ctx.body = {
      data: {},
      meta: buildPaginatedMeta(page, pageSize, 0),
    };
    return;
  }

  // Pass 2: Determine which collections contain our page window
  const globalOffset = (page - 1) * pageSize;
  const result: Record<string, AssetResult> = {};

  // Get collection titles for all matching collections
  const matchingCollections = collectionCounts.map((c) => c.collectionName);
  const collectionTitles = await getCollectionTitles(ctx.db, matchingCollections);

  let skipped = 0;
  let fetched = 0;

  for (const { collectionName, filter, count } of collectionCounts) {
    if (fetched >= pageSize) break;

    // How many records in this collection precede our window?
    if (skipped + count <= globalOffset) {
      // Entire collection is before our window — skip it
      skipped += count;
      continue;
    }

    // This collection overlaps with our window
    const coll = ctx.db.getCollection(collectionName);
    if (!coll) continue;

    // How many to skip within this collection
    const localOffset = Math.max(0, globalOffset - skipped);
    // How many to fetch from this collection
    const localLimit = Math.min(pageSize - fetched, count - localOffset);

    const relationFields = coll
      .getFields()
      .filter((f) => f.isRelationField())
      .map((f) => f.name);

    const assets = await ctx.db.getRepository(collectionName).find({
      filter: filter as any,
      appends: relationFields,
      limit: localLimit,
      offset: localOffset,
    });

    for (const asset of assets) {
      const assetName = asset.name as string;
      if (!assetName) continue;

      // Skip if we already have this asset (shouldn't happen but be safe)
      if (result[assetName]) continue;

      const resolvedData = resolveDataPlatform(coll, asset);

      result[assetName] = {
        platform: platformSlug,
        collection: collectionName,
        collection_title: collectionTitles[collectionName] || collectionName,
        data: resolvedData,
      };

      fetched++;
    }

    skipped += count;
  }

  ctx.body = {
    data: result,
    meta: buildPaginatedMeta(page, pageSize, totalCount),
  };
}
