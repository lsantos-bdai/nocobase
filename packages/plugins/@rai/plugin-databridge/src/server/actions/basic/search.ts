import { Context, Next } from '@nocobase/actions';
import { Collection, Field } from '@nocobase/database';
import { resolveCollectionBasic } from '../../utils/resolve-collection-basic';
import { resolveDataBasic } from '../../utils/fetch-assets-basic';
import { parsePaginationParams, buildPaginatedMeta } from '../../utils/pagination';
import { BasicAssetPayload } from '../../types/basic-asset-payload';

/**
 * Text field types that support $includes search.
 */
const TEXT_FIELD_TYPES = new Set(['string', 'text', 'uid', 'uuid']);

/**
 * Relation field types that can be searched via related record's name.
 */
const RELATION_FIELD_TYPES = new Set(['belongsTo', 'hasOne', 'hasMany', 'belongsToMany']);

/**
 * Get the search path for a field.
 * - Text fields: field name directly
 * - Relation fields: field.name (search related record's name)
 * - Others: null (not searchable)
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
 * Build $or filter for searching across all searchable fields in a collection.
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

/**
 * Search action for databridgeBasic — text search on a single collection (platform-free).
 *
 * Always searches all text fields + relation `.name` paths.
 * Returns paginated BasicAssetPayload items with relation descriptors.
 *
 * Query parameters:
 * - collection: Collection name or title (required, case-insensitive)
 * - q: Search term (required)
 * - page: Page number (default 1)
 * - pageSize: Items per page (default 50, max 300)
 *
 * Response: { data: BasicAssetPayload[], meta: { page, pageSize, count, totalPage } }
 */
export async function basicSearch(ctx: Context, next: Next) {
  const { collection, q, page: pageStr, pageSize: pageSizeStr } = ctx.request.query as {
    collection?: string;
    q?: string;
    page?: string;
    pageSize?: string;
  };

  if (!collection) {
    ctx.throw(400, 'collection query parameter is required');
  }

  if (!q || q.trim() === '') {
    ctx.throw(400, 'q (search term) query parameter is required');
  }

  const searchTerm = q.trim();

  // Parse and validate pagination
  const { page, pageSize } = parsePaginationParams(ctx, pageStr, pageSizeStr);

  // Resolve collection
  const collectionName = await resolveCollectionBasic(ctx, ctx.db, collection);

  const coll = ctx.db.getCollection(collectionName);
  if (!coll) {
    ctx.throw(404, `Collection '${collectionName}' not found`);
    return;
  }

  const collectionTitle = coll.options?.title || collectionName;

  // Build search filter across all searchable fields
  const searchFilter = buildSearchFilter(coll, searchTerm);
  if (!searchFilter) {
    ctx.body = {
      data: [],
      meta: buildPaginatedMeta(page, pageSize, 0),
    };
    ctx.withoutDataWrapping = true;
    return next();
  }

  // Get relation fields for appends (eager-load related objects for RelationDescriptor)
  const relationFields = coll
    .getFields()
    .filter((f) => f.isRelationField())
    .map((f) => f.name);

  // Query with search filter: fetch page + total count in parallel
  const offset = (page - 1) * pageSize;
  const repo = ctx.db.getRepository(collectionName);
  const [assets, count] = await Promise.all([
    repo.find({
      filter: searchFilter as any,
      appends: relationFields,
      limit: pageSize,
      offset,
    }),
    repo.count({ filter: searchFilter as any }),
  ]);

  // Transform to BasicAssetPayload with relation descriptors
  const data: BasicAssetPayload[] = [];
  for (const asset of assets) {
    const resolvedData = resolveDataBasic(coll, asset, ctx.db);
    data.push({
      collection: collectionName,
      collection_title: collectionTitle,
      data: resolvedData,
    });
  }

  ctx.body = {
    data,
    meta: buildPaginatedMeta(page, pageSize, count),
  };
  ctx.withoutDataWrapping = true;

  await next();
}
