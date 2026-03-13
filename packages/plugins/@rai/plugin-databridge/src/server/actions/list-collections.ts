import { Context, Next } from '@nocobase/actions';
import { parsePaginationParams, buildPaginationMeta } from '../utils/pagination';

/**
 * List all collections with sync eligibility (paginated).
 *
 * Query parameters:
 * - platformId: Optional — if provided, includes isSynced status for each collection
 * - page: Page number (default 1)
 * - pageSize: Items per page (default 50, max 300)
 *
 * Response: { data: [{ name, title, hasNameField, isSynced }], meta: { page, pageSize, count, totalPage } }
 */
export async function listCollections(ctx: Context, next: Next) {
  const { platformId } = ctx.action.params;
  const { page: pageStr, pageSize: pageSizeStr } = ctx.request.query as {
    page?: string;
    pageSize?: string;
  };

  const { page, pageSize } = parsePaginationParams(ctx, pageStr, pageSizeStr);

  // Get all collections from the collections table
  const allCollections = await ctx.db.getRepository('collections').find({
    fields: ['name', 'title'],
  });

  // If platformId provided, get the synced collections for that platform
  let syncedCollections = new Set<string>();
  if (platformId) {
    const platform = await ctx.db.getRepository('databridge_platforms').findOne({
      filterByTk: platformId,
    });

    if (platform?.collectionName) {
      const lookupCollection = ctx.db.getCollection(platform.collectionName);
      if (lookupCollection) {
        // Get distinct collection names from the lookup table
        const entries = await ctx.db.getRepository(platform.collectionName).find({
          fields: ['collection'],
        });
        syncedCollections = new Set(entries.map((e: any) => e.collection));
      }
    }
  }

  const allResults = allCollections.map((coll: any) => {
    const collection = ctx.db.getCollection(coll.name);
    const hasNameField = collection ? !!collection.getField('name') : false;

    return {
      name: coll.name,
      title: coll.title || coll.name,
      hasNameField,
      isSynced: syncedCollections.has(coll.name),
    };
  });

  // Sort: collections with name field first, then alphabetically
  allResults.sort((a: any, b: any) => {
    if (a.hasNameField !== b.hasNameField) {
      return a.hasNameField ? -1 : 1;
    }
    return a.title.localeCompare(b.title);
  });

  const count = allResults.length;

  // Apply pagination
  const offset = (page - 1) * pageSize;
  const data = allResults.slice(offset, offset + pageSize);

  ctx.body = {
    data,
    meta: buildPaginationMeta(page, pageSize, count),
  };
  ctx.withoutDataWrapping = true;
  await next();
}
