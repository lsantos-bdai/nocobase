import { Context, Next } from '@nocobase/actions';

export async function listCollections(ctx: Context, next: Next) {
  const collections = ctx.db.getCollection('collections');

  // Get all collections from the collections table
  const allCollections = await ctx.db.getRepository('collections').find({
    fields: ['name', 'title'],
  });

  const result = allCollections.map((coll: any) => {
    const collection = ctx.db.getCollection(coll.name);
    const hasNameField = collection ? !!collection.getField('name') : false;

    return {
      name: coll.name,
      title: coll.title || coll.name,
      hasNameField,
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
  await next();
}
