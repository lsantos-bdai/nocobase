import { Context, Next } from '@nocobase/actions';
import { getPlatformOrThrow, getLookupRepoOrThrow, getCollectionTitle, validateCollectionHasNameField } from '../utils';
import { syncRecordsToLookup } from '../utils';

export async function syncCollection(ctx: Context, next: Next) {
  const platformIdentifier = ctx.action.params.platform || ctx.request.query.platform;
  const { collection: collectionName } = ctx.action.params.values || {};

  if (!platformIdentifier) {
    ctx.throw(400, 'platform parameter (id or slug) is required');
  }

  if (!collectionName) {
    ctx.throw(400, 'collection name is required');
  }

  const platformRecord = await getPlatformOrThrow(ctx, platformIdentifier);
  const lookupRepo = await getLookupRepoOrThrow(ctx, platformRecord);

  // Validate collection exists and has 'name' field
  validateCollectionHasNameField(ctx, collectionName);

  // Get collection title
  const collectionTitle = await getCollectionTitle(ctx.db, collectionName);

  // Delete all entries for this collection
  await lookupRepo.destroy({
    filter: { collection: collectionName },
  });

  // Re-add all records from source collection
  const records = await ctx.db.getRepository(collectionName).find({
    fields: ['id', 'name'],
  });

  const { synced, errors } = await syncRecordsToLookup(lookupRepo, records, collectionName, collectionTitle);

  ctx.body = {
    synced,
    errors: errors.length > 0 ? errors : undefined,
  };

  ctx.withoutDataWrapping = true;
  await next();
}
