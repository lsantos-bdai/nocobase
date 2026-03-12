import { Context, Next } from '@nocobase/actions';
import { resolveCollectionBasic } from '../../utils/resolve-collection-basic';
import { fetchAssetsBasic } from '../../utils/fetch-assets-basic';

/**
 * Get assets from a collection using a JSON filter (platform-free).
 *
 * Query parameters:
 * - collection: Collection name or title (required, case-insensitive)
 * - filter: JSON filter object (required), e.g. {"name":"Amber"} or {"id":5}
 * - get_relations: If true, BFS-append related records as separate BasicAssetPayload items
 * - relation_depth: How deep to traverse relations (default 1)
 *
 * Response: list[BasicAssetPayload]
 */
export async function basicGet(ctx: Context, next: Next) {
  const { collection, filter, get_relations, relation_depth } = ctx.request.query as {
    collection?: string;
    filter?: string;
    get_relations?: string;
    relation_depth?: string;
  };

  if (!collection) {
    ctx.throw(400, 'collection query parameter is required');
  }

  if (!filter) {
    ctx.throw(400, 'filter query parameter is required');
  }

  // Parse JSON filter
  let parsedFilter: Record<string, unknown>;
  try {
    parsedFilter = JSON.parse(filter);
  } catch {
    ctx.throw(400, 'filter must be valid JSON');
    return; // unreachable, but satisfies TS
  }

  if (typeof parsedFilter !== 'object' || parsedFilter === null || Array.isArray(parsedFilter)) {
    ctx.throw(400, 'filter must be a JSON object');
  }

  const getRelations = get_relations === 'true';
  const relationDepth = parseInt(relation_depth || '1', 10);

  // Resolve collection (case-insensitive title match)
  const collectionName = await resolveCollectionBasic(ctx, ctx.db, collection);

  // Fetch assets with filter + optional relation expansion
  const result = await fetchAssetsBasic(ctx.db, collectionName, parsedFilter, {
    getRelations,
    relationDepth,
  });

  ctx.body = result;
  ctx.withoutDataWrapping = true;

  await next();
}
