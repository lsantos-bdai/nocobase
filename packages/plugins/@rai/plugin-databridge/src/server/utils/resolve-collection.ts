import { Context } from '@nocobase/actions';
import { Platform } from './platform-helpers';

/**
 * Platform-scoped collection resolution with case-insensitive title matching.
 *
 * Resolution order:
 * 1. Exact match against platform's registeredCollections (internal name)
 * 2. Query the platform's lookup table for distinct collection/collectionTitle pairs
 * 3. Case-insensitive match against collectionTitle:
 *    - 0 matches → 404
 *    - 1 match  → return internal name
 *    - 2+ matches → 409 (ambiguous)
 *
 * @param ctx  Koa context (used for db access and error throwing)
 * @param platform  The platform record (must include registeredCollections and collectionName)
 * @param value  The user-supplied collection identifier (internal name or human-readable title)
 * @returns The resolved internal collection name
 */
export async function resolveCollection(
  ctx: Context,
  platform: Platform,
  value: string,
): Promise<string> {
  const registeredCollections: string[] = platform.registeredCollections || [];

  // 1. Exact match on internal name
  if (registeredCollections.includes(value)) {
    return value;
  }

  // 2. Query the platform's lookup table for distinct collection/collectionTitle pairs
  const lookupRepo = ctx.db.getRepository(platform.collectionName);
  const lookupRows = await lookupRepo.find({
    fields: ['collection', 'collectionTitle'],
  });

  // Build distinct pairs
  const pairs = new Map<string, string>(); // collection -> collectionTitle
  for (const row of lookupRows) {
    if (row.collection && row.collectionTitle) {
      pairs.set(row.collection, row.collectionTitle);
    }
  }

  // 3. Case-insensitive match against collectionTitle
  const valueLower = value.toLowerCase();
  const matches: string[] = [];

  for (const [internalName, title] of pairs) {
    if (title.toLowerCase() === valueLower) {
      matches.push(internalName);
    }
  }

  if (matches.length === 0) {
    ctx.throw(404, `Collection '${value}' not found in platform '${platform.slug}'`);
  }

  if (matches.length > 1) {
    ctx.throw(
      409,
      `Ambiguous collection '${value}' in platform '${platform.slug}': matches ${matches.length} collections. Use the internal collection name instead.`,
    );
  }

  return matches[0];
}
