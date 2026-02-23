import { Context, Next } from '@nocobase/actions';
import { getPlatformOrThrow, getLookupRepoOrThrow, removeFromRegisteredCollections } from '../utils';

export async function removeCollection(ctx: Context, next: Next) {
  const { filterByTk } = ctx.action.params;
  const { collection: collectionName } = ctx.action.params.values || {};

  if (!filterByTk) {
    ctx.throw(400, 'filterByTk (platform id) is required');
  }

  if (!collectionName) {
    ctx.throw(400, 'collection name is required');
  }

  const platform = await getPlatformOrThrow(ctx, filterByTk);
  const lookupRepo = await getLookupRepoOrThrow(ctx, platform);

  // Delete all entries for this collection from lookup table
  const deleted = await lookupRepo.destroy({
    filter: { collection: collectionName },
  });

  // Update registeredCollections
  await removeFromRegisteredCollections(ctx, filterByTk, [collectionName]);

  ctx.body = {
    removed: typeof deleted === 'number' ? deleted : 0,
    collection: collectionName,
  };

  await next();
}
