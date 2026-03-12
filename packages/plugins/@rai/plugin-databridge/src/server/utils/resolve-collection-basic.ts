import { Context } from '@nocobase/actions';
import { Database } from '@nocobase/database';

/**
 * Platform-free collection resolution with case-insensitive title matching.
 *
 * Resolution order:
 * 1. Exact match against a known collection name via db.getCollection()
 * 2. Case-insensitive title match against the NocoBase `collections` system table:
 *    - 0 matches → 404
 *    - 1 match  → return internal name
 *    - 2+ matches → 409 (ambiguous)
 *
 * @param ctx   Koa context (used for error throwing)
 * @param db    Database instance
 * @param value The user-supplied collection identifier (internal name or human-readable title)
 * @returns The resolved internal collection name
 */
export async function resolveCollectionBasic(
  ctx: Context,
  db: Database,
  value: string,
): Promise<string> {
  // 1. Exact match on internal name
  const directCollection = db.getCollection(value);
  if (directCollection) {
    return value;
  }

  // 2. Query system collections table for case-insensitive title match
  const collectionRecords = await db.getRepository('collections').find({
    fields: ['name', 'title'],
  });

  const valueLower = value.toLowerCase();
  const matches: string[] = [];

  for (const record of collectionRecords) {
    const title = record.title as string | undefined;
    if (title && title.toLowerCase() === valueLower) {
      matches.push(record.name as string);
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

  return matches[0];
}
