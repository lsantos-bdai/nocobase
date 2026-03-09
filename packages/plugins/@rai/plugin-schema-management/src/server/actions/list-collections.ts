import { Context, Next } from '@nocobase/actions';

export async function listCollections(ctx: Context, next: Next) {
  // Query collections metadata table
  const collections = await ctx.db.getRepository('collections').find({
    fields: ['name', 'title'],
  });

  const result = collections
    // Filter out internal tables (junction tables, system tables without proper titles)
    .filter((coll: any) => {
      // Keep if it has a user-set title that's different from the internal name
      const hasProperTitle = coll.title && coll.title !== coll.name && !coll.title.startsWith('t_');
      return hasProperTitle;
    })
    .map((coll: any) => {
      const collection = ctx.db.getCollection(coll.name);
      const fieldCount = collection ? collection.getFields().length : 0;

      return {
        name: coll.name,
        title: coll.title || coll.name,
        fieldCount,
      };
    });

  // Sort alphabetically by title
  result.sort((a, b) => a.title.localeCompare(b.title));

  ctx.body = result;
  ctx.withoutDataWrapping = true;
  await next();
}
