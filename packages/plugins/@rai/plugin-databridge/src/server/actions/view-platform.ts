import { Context, Next } from '@nocobase/actions';

export async function viewPlatform(ctx: Context, next: Next) {
  const { filterByTk } = ctx.action.params;
  const { page = 1, pageSize = 50 } = ctx.action.params;

  if (!filterByTk) {
    ctx.throw(400, 'filterByTk (platform id) is required');
  }

  const platform = await ctx.db.getRepository('databridge_platforms').findOne({
    filterByTk,
  });

  if (!platform) {
    ctx.throw(404, 'Platform not found');
  }

  const lookupRepo = ctx.db.getRepository(platform.collectionName);

  const [entries, total] = await Promise.all([
    lookupRepo.find({
      limit: pageSize,
      offset: (page - 1) * pageSize,
      sort: ['name'],
    }),
    lookupRepo.count(),
  ]);

  // Get unique collection names from entries
  const collectionNames = [...new Set(entries.map((e: any) => e.collection))];

  // Look up titles from NocoBase collections repository
  const collectionRecords = await ctx.db.getRepository('collections').find({
    filter: { name: { $in: collectionNames } },
    fields: ['name', 'title'],
  });

  // Build name → title map
  const collectionTitles: Record<string, string> = {};
  for (const coll of collectionRecords) {
    collectionTitles[coll.name] = coll.title || coll.name;
  }

  ctx.body = {
    data: entries,
    meta: { page, pageSize, total },
    collectionTitles,
  };

  await next();
}
