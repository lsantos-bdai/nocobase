import { Context, Next } from '@nocobase/actions';

export async function listCollections(ctx: Context, next: Next) {
  const { platformId } = ctx.action.params;

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

  const result = allCollections.map((coll: any) => {
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
  result.sort((a: any, b: any) => {
    if (a.hasNameField !== b.hasNameField) {
      return a.hasNameField ? -1 : 1;
    }
    return a.title.localeCompare(b.title);
  });

  ctx.body = result;
  ctx.withoutDataWrapping = true;
  await next();
}
