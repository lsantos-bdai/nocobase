import { Context } from '@nocobase/actions';

/**
 * Global collection resolution with case-insensitive title matching.
 *
 * Resolution order:
 * 1. ctx.db.getCollection(value) — try as internal name (in-memory, instant)
 * 2. Query the `collections` table case-insensitively for title
 *    - 0 matches → 404
 *    - 1 match  → return internal name
 *    - 2+ matches → 409 (ambiguous)
 *
 * @param ctx  Koa context (used for db access and error throwing)
 * @param value  The user-supplied collection identifier (internal name or human-readable title)
 * @returns Object with the resolved internal collection name and the collection title
 */
export async function resolveCollection(
  ctx: Context,
  value: string,
): Promise<{ resolvedName: string; collectionTitle: string }> {
  // 1. Try direct lookup by internal name (in-memory)
  const directCollection = ctx.db.getCollection(value);
  if (directCollection) {
    // Fetch the title from the collections table
    const collMeta = await ctx.db.getRepository('collections').findOne({
      filter: { name: directCollection.name },
      fields: ['name', 'title'],
    });
    return {
      resolvedName: directCollection.name,
      collectionTitle: collMeta?.title || value,
    };
  }

  // 2. Case-insensitive title search
  const allCollections = await ctx.db.getRepository('collections').find({
    fields: ['name', 'title'],
  });

  const valueLower = value.toLowerCase();
  const matches: Array<{ name: string; title: string }> = [];

  for (const coll of allCollections) {
    if (coll.title?.toLowerCase() === valueLower) {
      matches.push({ name: coll.name, title: coll.title });
    }
  }

  if (matches.length === 0) {
    ctx.throw(404, `Collection '${value}' not found`);
  }

  if (matches.length > 1) {
    ctx.throw(
      409,
      `Ambiguous collection '${value}': matches ${matches.length} collections. Use the internal collection name instead.`,
    );
  }

  return {
    resolvedName: matches[0].name,
    collectionTitle: matches[0].title,
  };
}
