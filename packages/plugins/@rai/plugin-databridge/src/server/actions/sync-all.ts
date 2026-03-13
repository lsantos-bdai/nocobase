import { Context, Next } from '@nocobase/actions';
import { getPlatformOrThrow, getLookupRepoOrThrow, getCollectionTitles } from '../utils';
import { syncRecordsToLookup } from '../utils';

export async function syncAll(ctx: Context, next: Next) {
  const platformIdentifier = ctx.action.params.platform || ctx.request.query.platform;

  if (!platformIdentifier) {
    ctx.throw(400, 'platform parameter (id or slug) is required');
  }

  const platformRecord = await getPlatformOrThrow(ctx, platformIdentifier);
  const lookupRepo = await getLookupRepoOrThrow(ctx, platformRecord);

  // Get distinct collection names from the lookup table
  const entries = await lookupRepo.find({ fields: ['collection'] });
  const collectionNames: string[] = Array.from(new Set(entries.map((e: any) => String(e.collection))));

  if (collectionNames.length === 0) {
    ctx.body = { synced: 0, collections: [] };
    ctx.withoutDataWrapping = true;
    await next();
    return;
  }

  // Get collection titles
  const collectionTitles = await getCollectionTitles(ctx.db, collectionNames);

  // Clear all entries using TRUNCATE for reliability
  const lookupCollection = ctx.db.getCollection(platformRecord.collectionName);
  const model = lookupCollection.model;
  await model.destroy({ where: {}, truncate: true });

  let totalSynced = 0;
  const allErrors: string[] = [];

  for (const collName of collectionNames) {
    const coll = ctx.db.getCollection(collName);
    const collTitle = collectionTitles[collName] || collName;

    if (!coll) {
      allErrors.push(`Collection '${collTitle}' no longer exists`);
      continue;
    }

    const records = await ctx.db.getRepository(collName).find({
      fields: ['id', 'name'],
    });

    const { synced, errors } = await syncRecordsToLookup(lookupRepo, records, collName, collTitle);

    totalSynced += synced;
    allErrors.push(...errors);
  }

  ctx.body = {
    synced: totalSynced,
    collections: collectionNames,
    errors: allErrors.length > 0 ? allErrors : undefined,
  };

  ctx.withoutDataWrapping = true;
  await next();
}
