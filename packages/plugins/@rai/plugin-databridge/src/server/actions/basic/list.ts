import { Context, Next } from '@nocobase/actions';
import { resolveCollectionBasic } from '../../utils/resolve-collection-basic';
import { resolveDataBasic, mapFilterKeys } from '../../utils/fetch-assets-basic';
import { buildFieldMapping } from '../../utils/field-mapping';
import { BasicAssetPayload } from '../../types/basic-asset-payload';

/**
 * Map user-friendly sort keys to internal field names.
 * Sort entries look like "name", "-createdAt" (prefix "-" = descending).
 * Unknown keys are passed through as-is.
 */
function mapSortKeys(
  collection: ReturnType<import('@nocobase/database').Database['getCollection']>,
  sortArr: string[],
): string[] {
  const fieldMapping = buildFieldMapping(collection);
  return sortArr.map((entry) => {
    const desc = entry.startsWith('-');
    const key = desc ? entry.slice(1) : entry;
    const field = fieldMapping.get(key);
    const internalName = field ? field.name : key;
    return desc ? `-${internalName}` : internalName;
  });
}

/**
 * Map user-friendly field names to internal field names.
 * Unknown keys are passed through as-is.
 */
function mapFieldNames(
  collection: ReturnType<import('@nocobase/database').Database['getCollection']>,
  fieldArr: string[],
): string[] {
  const fieldMapping = buildFieldMapping(collection);
  return fieldArr.map((key) => {
    const field = fieldMapping.get(key);
    return field ? field.name : key;
  });
}

/**
 * Paginated list action for databridgeBasic (platform-free).
 *
 * Query parameters:
 * - collection: Collection name or title (required, case-insensitive)
 * - page: Page number (default 1)
 * - pageSize: Items per page (default 20, max 100)
 * - sort: JSON string array, e.g. ["-createdAt","name"] (optional)
 * - filter: JSON filter object (optional)
 * - fields: JSON string array of field names to include (optional)
 *
 * Response: { data: BasicAssetPayload[], meta: { page, pageSize, count, totalPage } }
 */
export async function basicList(ctx: Context, next: Next) {
  const {
    collection,
    page: pageStr,
    pageSize: pageSizeStr,
    sort: sortStr,
    filter: filterStr,
    fields: fieldsStr,
  } = ctx.request.query as {
    collection?: string;
    page?: string;
    pageSize?: string;
    sort?: string;
    filter?: string;
    fields?: string;
  };

  if (!collection) {
    ctx.throw(400, 'collection query parameter is required');
  }

  // Parse pagination
  const page = Math.max(parseInt(pageStr || '1', 10), 1);
  const pageSize = Math.min(Math.max(parseInt(pageSizeStr || '20', 10), 1), 100);

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

  // Parse optional filter
  let parsedFilter: Record<string, unknown> | undefined;
  if (filterStr) {
    try {
      parsedFilter = JSON.parse(filterStr);
    } catch {
      ctx.throw(400, 'filter must be valid JSON');
    }
    if (typeof parsedFilter !== 'object' || parsedFilter === null || Array.isArray(parsedFilter)) {
      ctx.throw(400, 'filter must be a JSON object');
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

  // Resolve collection (case-insensitive title match)
  const collectionName = await resolveCollectionBasic(ctx, ctx.db, collection);

  const coll = ctx.db.getCollection(collectionName);
  if (!coll) {
    ctx.throw(404, `Collection '${collectionName}' not found`);
    return;
  }

  const collectionTitle = coll.options?.title || collectionName;

  // Map filter keys to internal field names
  const internalFilter = parsedFilter ? mapFilterKeys(coll, parsedFilter) : undefined;

  // Map sort keys to internal field names
  const internalSort = parsedSort ? mapSortKeys(coll, parsedSort) : undefined;

  // Map field names to internal field names
  const internalFields = parsedFields ? mapFieldNames(coll, parsedFields) : undefined;

  // Get relation fields for appends (eager-load related objects for RelationDescriptor)
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
  if (internalSort) {
    findOptions.sort = internalSort;
  }
  if (internalFields) {
    findOptions.fields = internalFields;
  }

  // Query: fetch page + total count
  const repo = ctx.db.getRepository(collectionName);
  const [assets, count] = await Promise.all([
    repo.find(findOptions as any),
    repo.count({ filter: internalFilter || {} } as any),
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

  const totalPage = Math.ceil(count / pageSize);

  ctx.body = {
    data,
    meta: {
      page,
      pageSize,
      count,
      totalPage,
    },
  };
  ctx.withoutDataWrapping = true;

  await next();
}
