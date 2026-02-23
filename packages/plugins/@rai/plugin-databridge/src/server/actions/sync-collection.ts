import { Context, Next } from '@nocobase/actions';

export async function syncCollection(ctx: Context, next: Next) {
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

  // Validate collection exists and has 'name' field
  const coll = ctx.db.getCollection(collectionName);
  if (!coll) {
    ctx.throw(400, `Collection '${collectionName}' does not exist`);
  }
  if (!coll.getField('name')) {
    ctx.throw(400, `Collection '${collectionName}' must have a 'name' field`);
  }

  const lookupRepo = ctx.db.getRepository(platform.collectionName);

  // Look up collection title
  const collectionRecord = await ctx.db.getRepository('collections').findOne({
    filter: { name: collectionName },
    fields: ['name', 'title'],
  });
  const collectionTitle = collectionRecord?.title || collectionName;

  // Delete all entries for this collection
  await lookupRepo.destroy({
    filter: { collection: collectionName },
  });

  // Re-add all records from source collection
  const records = await ctx.db.getRepository(collectionName).find({
    fields: ['id', 'name'],
  });

  let synced = 0;
  const errors: string[] = [];

  for (const record of records) {
    if (!record.name) continue;

    try {
      await lookupRepo.create({
        values: {
          name: record.name,
          collection: collectionName,
          collectionTitle,
          assetId: String(record.id),
        },
      });
      synced++;
    } catch (err: any) {
      if (err.name === 'SequelizeUniqueConstraintError') {
        errors.push(`Duplicate name '${record.name}' conflicts with existing entry`);
      } else {
        throw err;
      }
    }
  }

  ctx.body = {
    synced,
    errors: errors.length > 0 ? errors : undefined,
  };

  await next();
}
