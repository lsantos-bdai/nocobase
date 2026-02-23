import { Context, Next } from '@nocobase/actions';

export async function removeCollection(ctx: Context, next: Next) {
  const { filterByTk } = ctx.action.params;
  const { collection: collectionName } = ctx.action.params.values || {};

  if (!filterByTk) {
    ctx.throw(400, 'filterByTk (platform id) is required');
  }

  if (!collectionName) {
    ctx.throw(400, 'collection name is required');
  }

  // Get platform
  const platform = await ctx.db.getRepository('databridge_platforms').findOne({
    filterByTk,
  });

  if (!platform) {
    ctx.throw(404, 'Platform not found');
  }

  // Ensure the lookup collection exists
  const lookupCollection = ctx.db.getCollection(platform.collectionName);
  if (!lookupCollection) {
    ctx.throw(500, `Lookup collection '${platform.collectionName}' not found. Please recreate the platform.`);
  }

  const lookupRepo = ctx.db.getRepository(platform.collectionName);
  const platformsRepo = ctx.db.getRepository('databridge_platforms');

  // Delete all entries for this collection from lookup table
  const deleted = await lookupRepo.destroy({
    filter: { collection: collectionName },
  });

  // Update registeredCollections
  const currentCollections: string[] = platform.registeredCollections || [];
  const newRegistered = currentCollections.filter((c: string) => c !== collectionName);
  await platformsRepo.update({
    filterByTk,
    values: { registeredCollections: newRegistered },
  });

  ctx.body = {
    removed: typeof deleted === 'number' ? deleted : 0,
    collection: collectionName,
  };

  await next();
}
