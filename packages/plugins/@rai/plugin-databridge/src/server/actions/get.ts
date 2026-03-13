import { Context, Next } from '@nocobase/actions';
import { getPlatformBySlugOrThrow, getCollectionTitles, resolveDataPlatform } from '../utils';
import {
  parsePaginationParams,
  parseMaxAssets,
  buildPaginationMeta,
} from '../utils/pagination';
import { buildAssetGraphFromRefs, fetchWindowRecords, dedupeKey, AssetRef } from '../utils/build-asset-graph';

interface AssetResult {
  platform: string;
  collection: string;
  collection_title: string;
  data: Record<string, unknown>;
}

/**
 * Get assets by name from a platform.
 *
 * Two modes of operation:
 *
 * 1. Without relations (get_relations=false, default):
 *    Standard paginated query over the platform's lookup table.
 *    page/pageSize control the window over matching assets.
 *    meta = { page, pageSize, count, totalPage }
 *
 * 2. With relations (get_relations=true):
 *    Two-phase graph + window approach:
 *    - Phase 1: Resolve asset names via lookup table, then BFS-expand relation IDs
 *      capped at max_assets total items.
 *    - Phase 2: Paginate over the full graph. Only fetch full records for the current
 *      page window.
 *    meta = { page, pageSize, count, totalPage, truncated, max_assets }
 *    count = total graph size (primaries + relations), not just primary matches.
 *
 * Query parameters:
 * - platform: Platform slug (required)
 * - asset_name: Asset name(s) to fetch (required, repeatable)
 * - page: Page number (default 1)
 * - pageSize: Items per page (default 50, max 300)
 * - get_relations: If true, BFS-expand relations into the asset graph
 * - relation_depth: How deep to traverse relations (default 1)
 * - max_assets: Max total graph size when get_relations=true (default 1000)
 *
 * Response: { data: { [assetName]: AssetResult }, meta }
 */
export async function get(ctx: Context, next: Next) {
  const {
    platform,
    asset_name,
    get_relations,
    relation_depth,
    max_assets: maxAssetsStr,
    page: pageStr,
    pageSize: pageSizeStr,
  } = ctx.request.query as {
    platform?: string;
    asset_name?: string | string[];
    get_relations?: string;
    relation_depth?: string;
    max_assets?: string;
    page?: string;
    pageSize?: string;
  };

  if (!platform || !asset_name) {
    ctx.throw(400, 'platform and asset_name query parameters are required');
  }

  // Normalize asset_name to array
  const assetNames = Array.isArray(asset_name) ? asset_name : [asset_name];
  const getRelations = get_relations === 'true';
  const relationDepth = parseInt(relation_depth || '1', 10);
  const { page, pageSize } = parsePaginationParams(ctx, pageStr, pageSizeStr);

  // Get platform from directory by slug
  const platformRecord = await getPlatformBySlugOrThrow(ctx, platform);

  // Resolve asset names to {collection, assetId} via lookup table
  const lookupResults = await ctx.db.getRepository(platformRecord.collectionName).find({
    filter: { name: { $in: assetNames } },
  });

  if (getRelations) {
    // ── Two-phase graph + window approach ──

    const maxAssets = parseMaxAssets(ctx, maxAssetsStr);

    // Convert lookup results to seed refs
    const seedRefs: AssetRef[] = lookupResults.map((lookup: any) => ({
      collection: lookup.collection,
      id: typeof lookup.assetId === 'string' ? parseInt(lookup.assetId, 10) || lookup.assetId : lookup.assetId,
    }));

    // Phase 1: Build lightweight asset graph from seed refs
    const graph = await buildAssetGraphFromRefs(ctx.db, seedRefs, maxAssets, relationDepth);

    const totalCount = graph.refs.length;

    // Phase 2: Slice the graph for the current page window
    const offset = (page - 1) * pageSize;
    const windowRefs = graph.refs.slice(offset, offset + pageSize);

    // Fetch full records for the window
    const recordMap = await fetchWindowRecords(ctx.db, windowRefs);

    // Get collection titles for all collections in the window
    const windowCollections = [...new Set(windowRefs.map((r) => r.collection))];
    const collectionTitles = await getCollectionTitles(ctx.db, windowCollections);

    // Build name-keyed result map in graph order
    const data: Record<string, AssetResult> = {};
    for (const ref of windowRefs) {
      const key = dedupeKey(ref.collection, ref.id);
      const entry = recordMap.get(key);
      if (!entry) continue;

      const resolvedData = resolveDataPlatform(entry.collection, entry.record);
      const assetName = (entry.record as any).name as string;
      if (!assetName) continue;

      data[assetName] = {
        platform,
        collection: ref.collection,
        collection_title: collectionTitles[ref.collection] || ref.collection,
        data: resolvedData,
      };
    }

    ctx.body = {
      data,
      meta: buildPaginationMeta(page, pageSize, totalCount, graph.truncated, maxAssets),
    };
  } else {
    // ── Standard paginated query (no relations) ──

    const totalCount = lookupResults.length;

    // Sort lookup results by name for deterministic pagination
    lookupResults.sort((a: any, b: any) => {
      const nameA = (a.name || '').toLowerCase();
      const nameB = (b.name || '').toLowerCase();
      return nameA < nameB ? -1 : nameA > nameB ? 1 : 0;
    });

    // Page over lookup results
    const offset = (page - 1) * pageSize;
    const pageResults = lookupResults.slice(offset, offset + pageSize);

    if (pageResults.length === 0) {
      ctx.body = {
        data: {},
        meta: buildPaginationMeta(page, pageSize, totalCount),
      };
      ctx.withoutDataWrapping = true;
      return next();
    }

    // Convert to refs and fetch full records
    const windowRefs: AssetRef[] = pageResults.map((lookup: any) => ({
      collection: lookup.collection,
      id: typeof lookup.assetId === 'string' ? parseInt(lookup.assetId, 10) || lookup.assetId : lookup.assetId,
    }));

    const recordMap = await fetchWindowRecords(ctx.db, windowRefs);

    // Get collection titles
    const windowCollections = [...new Set(windowRefs.map((r) => r.collection))];
    const collectionTitles = await getCollectionTitles(ctx.db, windowCollections);

    // Build name-keyed result map
    const data: Record<string, AssetResult> = {};
    for (let i = 0; i < windowRefs.length; i++) {
      const ref = windowRefs[i];
      const key = dedupeKey(ref.collection, ref.id);
      const entry = recordMap.get(key);
      if (!entry) continue;

      const resolvedData = resolveDataPlatform(entry.collection, entry.record);
      const assetName = pageResults[i].name as string;

      data[assetName] = {
        platform,
        collection: ref.collection,
        collection_title: collectionTitles[ref.collection] || ref.collection,
        data: resolvedData,
      };
    }

    ctx.body = {
      data,
      meta: buildPaginationMeta(page, pageSize, totalCount),
    };
  }

  ctx.withoutDataWrapping = true;
  await next();
}
