import { Context, Next } from '@nocobase/actions';
import { getSchemaUrl } from '../../constants';
import { resolveCollectionBasic } from '../../utils/resolve-collection-basic';
import { resolveDataBasic, mapFilterKeys } from '../../utils/fetch-assets-basic';
import {
  parsePaginationParams,
  parseMaxAssets,
  buildPaginatedMeta,
  buildGraphPaginatedMeta,
} from '../../utils/pagination';
import { buildAssetGraph, fetchWindowRecords, dedupeKey } from '../../utils/build-asset-graph';
import { BasicAssetPayload, RelationDescriptor } from '../../types/basic-asset-payload';

/**
 * Get assets in schema-conformant format (platform-free).
 *
 * Two modes of operation:
 *
 * 1. Without relations (get_relations=false, default):
 *    Standard paginated query. page/pageSize control the window over primary records.
 *    meta = { page, pageSize, count, totalPage }
 *
 * 2. With relations (get_relations=true):
 *    Two-phase graph + window approach:
 *    - Phase 1: Build a lightweight asset graph capped at max_assets.
 *    - Phase 2: Paginate over the full graph. Only fetch full records for current page.
 *    meta = { page, pageSize, count, totalPage, truncated, max_assets }
 *    count = total graph size (primaries + relations).
 *
 * Returns flat data objects with a `$schema` property pointing to the GCS-hosted
 * schema YAML. Relation fields show name strings, falling back to stringified IDs.
 *
 * Query parameters:
 * - collection: Collection name or title (required, case-insensitive)
 * - filter: JSON filter object (optional)
 * - env: "prod" or "dev" (required) — selects GCS bucket
 * - page: Page number (default 1)
 * - pageSize: Items per page (default 50, max 300) — applies to total items
 * - get_relations: If true, include related records in the output
 * - relation_depth: How deep to traverse relations (default 1)
 * - max_assets: Max total graph size when get_relations=true (default 1000)
 */
export async function basicGetSchemaConformant(ctx: Context, next: Next) {
  const {
    collection,
    filter: filterStr,
    env,
    page: pageStr,
    pageSize: pageSizeStr,
    get_relations,
    relation_depth,
    max_assets: maxAssetsStr,
  } = ctx.request.query as {
    collection?: string;
    filter?: string;
    env?: string;
    page?: string;
    pageSize?: string;
    get_relations?: string;
    relation_depth?: string;
    max_assets?: string;
  };

  if (!collection) {
    ctx.throw(400, 'collection query parameter is required');
  }

  if (!env || (env !== 'prod' && env !== 'dev')) {
    ctx.throw(400, 'env query parameter is required and must be "prod" or "dev"');
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
      return;
    }
    if (typeof parsedFilter !== 'object' || parsedFilter === null || Array.isArray(parsedFilter)) {
      ctx.throw(400, 'filter must be a JSON object');
    }
  }

  const getRelations = get_relations === 'true';
  const relationDepth = parseInt(relation_depth || '1', 10);

  // Resolve collection
  const collectionName = await resolveCollectionBasic(ctx, ctx.db, collection);

  const coll = ctx.db.getCollection(collectionName);
  if (!coll) {
    ctx.throw(404, `Collection '${collectionName}' not found`);
    return;
  }

  // Map filter keys to internal field names
  const internalFilter = parsedFilter ? mapFilterKeys(coll, parsedFilter) : undefined;

  // Map env to internal response type key
  const responseType = env === 'prod' ? 'dippy_prod' : 'dippy_dev';

  if (getRelations) {
    // ── Two-phase graph + window approach ──

    const maxAssets = parseMaxAssets(ctx, maxAssetsStr);

    // Phase 1: Build lightweight asset graph
    const graph = await buildAssetGraph(
      ctx.db,
      collectionName,
      internalFilter,
      undefined, // no sort for schema-conformant
      maxAssets,
      relationDepth,
    );

    const totalCount = graph.refs.length;

    // Phase 2: Slice the graph for the current page window
    const offset = (page - 1) * pageSize;
    const windowRefs = graph.refs.slice(offset, offset + pageSize);

    // Fetch full records for the window
    const recordMap = await fetchWindowRecords(ctx.db, windowRefs);

    // Build response data in graph order, flattened to schema-conformant format
    const flatItems: Record<string, unknown>[] = [];
    for (const ref of windowRefs) {
      const key = dedupeKey(ref.collection, ref.id);
      const entry = recordMap.get(key);
      if (!entry) continue;

      const resolvedData = resolveDataBasic(entry.collection, entry.record, ctx.db);
      const refColl = ctx.db.getCollection(ref.collection);
      const refTitle = refColl?.options?.title || ref.collection;
      const schemaUrl = getSchemaUrl(responseType, refTitle);

      flatItems.push(flattenToSchemaConformant(schemaUrl, resolvedData));
    }

    ctx.body = {
      data: flatItems,
      meta: buildGraphPaginatedMeta(page, pageSize, totalCount, graph.truncated, maxAssets),
    };
  } else {
    // ── Standard paginated query (no relations) ──

    const collectionTitle = coll.options?.title || collectionName;

    // Get relation fields for appends
    const relationFields = coll
      .getFields()
      .filter((f) => f.isRelationField())
      .map((f) => f.name);

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

    // Query: fetch page + total count in parallel
    const repo = ctx.db.getRepository(collectionName);
    const [assets, count] = await Promise.all([
      repo.find(findOptions as any),
      repo.count({ filter: internalFilter || {} } as any),
    ]);

    // Transform to schema-conformant flat format
    const flatItems: Record<string, unknown>[] = [];
    for (const asset of assets) {
      const resolvedData = resolveDataBasic(coll, asset, ctx.db);
      const schemaUrl = getSchemaUrl(responseType, collectionTitle);
      flatItems.push(flattenToSchemaConformant(schemaUrl, resolvedData));
    }

    ctx.body = {
      data: flatItems,
      meta: buildPaginatedMeta(page, pageSize, count),
    };
  }

  ctx.withoutDataWrapping = true;

  await next();
}

/**
 * Flatten resolved data to schema-conformant format.
 * Relation descriptors become name strings (or stringified IDs as fallback).
 */
function flattenToSchemaConformant(
  schemaUrl: string,
  resolvedData: Record<string, unknown>,
): Record<string, unknown> {
  const flatData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(resolvedData)) {
    if (isRelationDescriptor(value)) {
      const desc = value as RelationDescriptor;
      if (desc.name.length > 0) {
        flatData[key] = desc.id.length === 1 ? desc.name[0] : desc.name;
      } else {
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
}

/**
 * Check if a value is a RelationDescriptor.
 */
function isRelationDescriptor(value: unknown): value is RelationDescriptor {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.collection === 'string' && Array.isArray(obj.id);
}
