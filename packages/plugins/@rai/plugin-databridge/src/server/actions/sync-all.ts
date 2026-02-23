import { Context, Next } from '@nocobase/actions';

export async function syncAll(ctx: Context, next: Next) {
  const { filterByTk } = ctx.action.params;

  if (!filterByTk) {
    ctx.throw(400, 'filterByTk (platform id) is required');
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

  // Get distinct collection names from the lookup table
  const entries = await lookupRepo.find({
    fields: ['collection'],
  });
  const collectionNames = [...new Set(entries.map((e: any) => e.collection))];

  if (collectionNames.length === 0) {
    ctx.body = {
      synced: 0,
      collections: 0,
    };
    await next();
    return;
  }

  // Look up collection titles
  const collectionRecords = await ctx.db.getRepository('collections').find({
    filter: { name: { $in: collectionNames } },
    fields: ['name', 'title'],
  });
  const collectionTitles: Record<string, string> = {};
  for (const coll of collectionRecords) {
    collectionTitles[coll.name] = coll.title || coll.name;
  }

  // Clear all entries using TRUNCATE for reliability
  const model = lookupCollection.model;
  await model.destroy({ where: {}, truncate: true });

  let synced = 0;
  const errors: string[] = [];

  for (const collName of collectionNames) {
    const coll = ctx.db.getCollection(collName);
    if (!coll) {
      errors.push(`Collection '${collName}' no longer exists`);
      continue;
    }

    const records = await ctx.db.getRepository(collName).find({
      fields: ['id', 'name'],
    });

    for (const record of records) {
      if (!record.name) continue;

      try {
        await lookupRepo.create({
          values: {
            name: record.name,
            collection: collName,
            collectionTitle: collectionTitles[collName] || collName,
            assetId: String(record.id),
          },
        });
        synced++;
      } catch (err: any) {
        if (err.name === 'SequelizeUniqueConstraintError') {
          errors.push(`Duplicate name '${record.name}' from collection '${collName}'`);
        } else {
          throw err;
        }
      }
    }
  }

  ctx.body = {
    synced,
    collections: collectionNames.length,
    errors: errors.length > 0 ? errors : undefined,
  };

  await next();
}
