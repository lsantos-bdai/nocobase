import { Context, Next } from '@nocobase/actions';
import { resolveCollectionBasic } from '../../utils/resolve-collection-basic';
import { resolveDataBasic, mapFilterKeys } from '../../utils/fetch-assets-basic';
import { mapSortKeys, mapFieldNames } from '../../utils/field-mapping';
import {
  parsePaginationParams,
  parseMaxAssets,
  buildPaginationMeta,
} from '../../utils/pagination';
import { buildAssetGraph, fetchWindowRecords, dedupeKey } from '../../utils/build-asset-graph';
import { BasicAssetPayload } from '../../types/basic-asset-payload';

/**
 * Get/list assets from a collection (platform-free).
 *
 * Two modes of operation:
 *
 * 1. Without relations (get_relations=false, default):
 *    Standard paginated query. page/pageSize control the window over primary records.
 *    meta = { page, pageSize, count, totalPage }
 *
 * 2. With relations (get_relations=true):
 *    Two-phase graph + window approach:
 *    - Phase 1: Build a lightweight asset graph (primaries + BFS-expanded relation IDs)
 *      capped at max_assets total items.
 *    - Phase 2: Paginate over the full graph. Only fetch full records for the current
 *      page window.
 *    meta = { page, pageSize, count, totalPage, truncated, max_assets }
 *    count = total graph size (primaries + relations), not just primary matches.
 *
 * Query parameters:
 * - collection: Collection name or title (required, case-insensitive)
 * - filter: JSON filter object (optional), e.g. {"name":"Amber"} or {"id":5}
 * - page: Page number (default 1)
 * - pageSize: Items per page (default 50, max 300) — applies to total items, not just primaries
 * - sort: JSON string array, e.g. ["-createdAt","name"] (optional)
 * - fields: JSON string array of field names to include (optional)
 * - get_relations: If true, BFS-expand relations into the asset graph
 * - relation_depth: How deep to traverse relations (default 1)
 * - max_assets: Max total graph size when get_relations=true (default 1000)
 */
export async function basicGet(ctx: Context, next: Next) {
  const {
    collection,
    filter: filterStr,
    page: pageStr,
    pageSize: pageSizeStr,
    sort: sortStr,
    fields: fieldsStr,
    get_relations,
    relation_depth,
    max_assets: maxAssetsStr,
  } = ctx.request.query as {
    collection?: string;
    filter?: string;
    page?: string;
    pageSize?: string;
    sort?: string;
    fields?: string;
    get_relations?: string;
    relation_depth?: string;
    max_assets?: string;
  };

  if (!collection) {
    ctx.throw(400, 'collection query parameter is required');
  }

  // Parse and validate pagination
  const { page, pageSize } = parsePaginationParams(ctx, pageStr, pageSizeStr);

  // Parse optional filter
  let parsedFilter: Record<string, unknown> | undefined;
  if (filterStr) {
    try {
      parsedFilter = JSON.parse(filterStr);
    } catch {
      ctx.throw(400, 'filter must be valid JSON');
      return; // unreachable, but satisfies TS
    }
    if (typeof parsedFilter !== 'object' || parsedFilter === null || Array.isArray(parsedFilter)) {
      ctx.throw(400, 'filter must be a JSON object');
    }
  }

  // Parse optional sort
  let parsedSort: string[] | undefined;
  if (sortStr) {
    try {
      parsedSort = JSON.parse(sortStr);
    } catch {
      ctx.throw(400, 'sort must be a valid JSON array of strings');
    }
    if (!Array.isArray(parsedSort) || !parsedSort.every((s) => typeof s === 'string')) {
      ctx.throw(400, 'sort must be a JSON array of strings');
    }
  }

  // Parse optional fields
  let parsedFields: string[] | undefined;
  if (fieldsStr) {
    try {
      parsedFields = JSON.parse(fieldsStr);
    } catch {
      ctx.throw(400, 'fields must be a valid JSON array of strings');
    }
    if (!Array.isArray(parsedFields) || !parsedFields.every((s) => typeof s === 'string')) {
      ctx.throw(400, 'fields must be a JSON array of strings');
    }
  }

  const getRelations = get_relations === 'true';
  const relationDepth = parseInt(relation_depth || '1', 10);

  // Resolve collection (case-insensitive title match)
  const collectionName = await resolveCollectionBasic(ctx, ctx.db, collection);

  const coll = ctx.db.getCollection(collectionName);
  if (!coll) {
    ctx.throw(404, `Collection '${collectionName}' not found`);
    return;
  }

  const collectionTitle = coll.options?.title || collectionName;

  // Map filter/sort/fields to internal field names
  const internalFilter = parsedFilter ? mapFilterKeys(coll, parsedFilter) : undefined;
  const internalSort = parsedSort ? mapSortKeys(coll, parsedSort) : undefined;
  const internalFields = parsedFields ? mapFieldNames(coll, parsedFields) : undefined;

  if (getRelations) {
    // ── Two-phase graph + window approach ──

    const maxAssets = parseMaxAssets(ctx, maxAssetsStr);

    // Phase 1: Build lightweight asset graph
    const graph = await buildAssetGraph(
      ctx.db,
      collectionName,
      internalFilter,
      internalSort,
      maxAssets,
      relationDepth,
    );

    const totalCount = graph.refs.length;

    // Phase 2: Slice the graph for the current page window
    const offset = (page - 1) * pageSize;
    const windowRefs = graph.refs.slice(offset, offset + pageSize);

    // Fetch full records for the window
    const recordMap = await fetchWindowRecords(ctx.db, windowRefs);

    // Build response data in graph order
    const data: BasicAssetPayload[] = [];
    for (const ref of windowRefs) {
      const key = dedupeKey(ref.collection, ref.id);
      const entry = recordMap.get(key);
      if (!entry) continue;

      const resolvedData = resolveDataBasic(entry.collection, entry.record, ctx.db);

      // Apply user-requested fields filter if provided
      // Use parsedFields (user-facing normalized names) since resolveDataBasic
      // outputs keys as normalizeFieldName(title || field.name), not internal DB names.
      let finalData = resolvedData;
      if (parsedFields) {
        finalData = {};
        for (const [k, v] of Object.entries(resolvedData)) {
          if (k === 'id' || parsedFields.includes(k)) {
            finalData[k] = v;
          }
        }
      }

      const refColl = ctx.db.getCollection(ref.collection);
      const refTitle = refColl?.options?.title || ref.collection;

      data.push({
        collection: ref.collection,
        collection_title: refTitle,
        data: finalData,
      });
    }

    ctx.body = {
      data,
      meta: buildPaginationMeta(page, pageSize, totalCount, graph.truncated, maxAssets),
    };
  } else {
    // ── Standard paginated query (no relations) ──

    // Get relation fields for appends (eager-load related objects for RelationDescriptor).
    // When fields filter is active, only eager-load relations the user actually requested.
    const allRelationFields = coll
      .getFields()
      .filter((f) => f.isRelationField())
      .map((f) => f.name);
    const relationFields = internalFields
      ? allRelationFields.filter((name) => internalFields.includes(name))
      : allRelationFields;

    // Build find options
    const offset = (page - 1) * pageSize;
    const findOptions: Record<string, unknown> = {
      appends: relationFields,
      limit: pageSize,
      offset,
    };
    if (internalFilter) {
      findOptions.filter = internalFilter;
    }
    if (internalSort) {
      findOptions.sort = internalSort;
    }
    if (internalFields) {
      findOptions.fields = internalFields;
    }

    // Query: fetch page + total count in parallel
    const repo = ctx.db.getRepository(collectionName);
    const [assets, count] = await Promise.all([
      repo.find(findOptions as any),
      repo.count({ filter: internalFilter || {} } as any),
    ]);

    // Transform to BasicAssetPayload with relation descriptors
    const data: BasicAssetPayload[] = [];
    for (const asset of assets) {
      const resolvedData = resolveDataBasic(coll, asset, ctx.db);

      // Post-filter by user-requested fields (parsedFields = user-facing normalized names,
      // which match the keys output by resolveDataBasic).
      let finalData = resolvedData;
      if (parsedFields) {
        finalData = {};
        for (const [k, v] of Object.entries(resolvedData)) {
          if (k === 'id' || parsedFields.includes(k)) {
            finalData[k] = v;
          }
        }
      }

      data.push({
        collection: collectionName,
        collection_title: collectionTitle,
        data: finalData,
      });
    }

    ctx.body = {
      data,
      meta: buildPaginationMeta(page, pageSize, count),
    };
  }

  ctx.withoutDataWrapping = true;

  await next();
}
