import { Context, Next } from '@nocobase/actions';

export async function syncPlatform(ctx: Context, next: Next) {
  const { filterByTk } = ctx.action.params;
  const { collections } = ctx.action.params.values || {};

  if (!filterByTk) {
    ctx.throw(400, 'filterByTk (platform id) is required');
  }

  if (!collections || !Array.isArray(collections) || collections.length === 0) {
    ctx.throw(400, 'collections array is required');
  }

  // Get platform from directory
  const platform = await ctx.db.getRepository('databridge_platforms').findOne({
    filterByTk,
  });

  if (!platform) {
    ctx.throw(404, 'Platform not found');
  }

  // Validate all collections exist and have 'name' field
  for (const collName of collections) {
    const coll = ctx.db.getCollection(collName);
    if (!coll) {
      ctx.throw(400, `Collection '${collName}' does not exist`);
    }
    if (!coll.getField('name')) {
      ctx.throw(400, `Collection '${collName}' must have a 'name' field`);
    }
  }

  const lookupRepo = ctx.db.getRepository(platform.collectionName);
  const errors: string[] = [];
  let synced = 0;

  // Clear existing entries
  await lookupRepo.destroy({ filter: {} });

  // Sync each collection
  for (const collName of collections) {
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
            assetId: String(record.id),
          },
        });
        synced++;
      } catch (err: any) {
        // Duplicate name - collect error but continue
        if (err.name === 'SequelizeUniqueConstraintError') {
          errors.push(`Duplicate asset name '${record.name}' from collection '${collName}'`);
        } else {
          throw err;
        }
      }
    }
  }

  ctx.body = {
    synced,
    errors: errors.length > 0 ? errors : undefined,
  };

  await next();
}
