import { Context } from '@nocobase/actions';
import { Database, Repository } from '@nocobase/database';

export interface Platform {
  id: number | string;
  name: string;
  slug: string;
  collectionName: string;
  description?: string;
  registeredCollections: string[];
}

/**
 * Get a platform by ID or slug, throwing 404 if not found.
 * Accepts either numeric ID or string slug as identifier.
 */
export async function getPlatformOrThrow(ctx: Context, identifier: string | number): Promise<Platform> {
  const repo = ctx.db.getRepository('databridge_platforms');

  // If numeric, lookup by ID; otherwise lookup by slug
  const isNumeric = typeof identifier === 'number' || /^\d+$/.test(String(identifier));

  const platform = isNumeric
    ? await repo.findOne({ filterByTk: identifier })
    : await repo.findOne({ filter: { slug: identifier } });

  if (!platform) {
    ctx.throw(404, `Platform '${identifier}' not found`);
  }

  return platform as Platform;
}

/**
 * Get a platform by slug, throwing 404 if not found.
 */
export async function getPlatformBySlugOrThrow(ctx: Context, slug: string): Promise<Platform> {
  const platform = await ctx.db.getRepository('databridge_platforms').findOne({
    filter: { slug },
  });

  if (!platform) {
    ctx.throw(404, `Platform '${slug}' not found`);
  }

  return platform as Platform;
}

/**
 * Get the lookup repository for a platform, validating the collection exists.
 */
export async function getLookupRepoOrThrow(ctx: Context, platform: Platform): Promise<Repository> {
  const lookupCollection = ctx.db.getCollection(platform.collectionName);
  if (!lookupCollection) {
    ctx.throw(500, `Lookup collection '${platform.collectionName}' not found. Please recreate the platform.`);
  }

  return ctx.db.getRepository(platform.collectionName);
}

/**
 * Sync the lookup collection schema (ensures table exists).
 */
export async function syncLookupCollection(ctx: Context, platform: Platform): Promise<void> {
  const lookupCollection = ctx.db.getCollection(platform.collectionName);
  if (lookupCollection) {
    await lookupCollection.sync();
  }
}

/**
 * Fetch collection titles from the collections table.
 */
export async function getCollectionTitles(
  db: Database,
  collectionNames: string[]
): Promise<Record<string, string>> {
  if (collectionNames.length === 0) {
    return {};
  }

  const collectionRecords = await db.getRepository('collections').find({
    filter: { name: { $in: collectionNames } },
    fields: ['name', 'title'],
  });

  const titles: Record<string, string> = {};
  for (const coll of collectionRecords) {
    titles[coll.name] = coll.title || coll.name;
  }
  return titles;
}

/**
 * Get a single collection's title.
 */
export async function getCollectionTitle(db: Database, collectionName: string): Promise<string> {
  const collectionRecord = await db.getRepository('collections').findOne({
    filter: { name: collectionName },
    fields: ['name', 'title'],
  });
  return collectionRecord?.title || collectionName;
}

/**
 * Update the registeredCollections array for a platform.
 * Accepts either numeric ID or string slug as identifier.
 */
export async function updateRegisteredCollections(
  ctx: Context,
  identifier: string | number,
  toAdd: string[],
  toRemove: string[]
): Promise<void> {
  const platformsRepo = ctx.db.getRepository('databridge_platforms');
  const isNumeric = typeof identifier === 'number' || /^\d+$/.test(String(identifier));

  const platform = isNumeric
    ? await platformsRepo.findOne({ filterByTk: identifier })
    : await platformsRepo.findOne({ filter: { slug: identifier } });

  if (!platform) {
    return;
  }

  const currentCollections: string[] = platform.registeredCollections || [];
  const updatedCollections = new Set(currentCollections);

  for (const c of toRemove) {
    updatedCollections.delete(c);
  }
  for (const c of toAdd) {
    updatedCollections.add(c);
  }

  await platformsRepo.update({
    filterByTk: platform.id,
    values: { registeredCollections: [...updatedCollections] },
  });
}

/**
 * Remove collections from registeredCollections array.
 * Accepts either numeric ID or string slug as identifier.
 */
export async function removeFromRegisteredCollections(
  ctx: Context,
  identifier: string | number,
  toRemove: string[]
): Promise<void> {
  const platformsRepo = ctx.db.getRepository('databridge_platforms');
  const isNumeric = typeof identifier === 'number' || /^\d+$/.test(String(identifier));

  const platform = isNumeric
    ? await platformsRepo.findOne({ filterByTk: identifier })
    : await platformsRepo.findOne({ filter: { slug: identifier } });

  if (!platform) {
    return;
  }

  const currentCollections: string[] = platform.registeredCollections || [];
  const newRegistered = currentCollections.filter((c: string) => !toRemove.includes(c));

  await platformsRepo.update({
    filterByTk: platform.id,
    values: { registeredCollections: newRegistered },
  });
}

/**
 * Validate that a collection exists and has a 'name' field.
 */
export function validateCollectionHasNameField(ctx: Context, collectionName: string): void {
  const coll = ctx.db.getCollection(collectionName);
  if (!coll) {
    ctx.throw(400, `Collection '${collectionName}' does not exist`);
  }
  if (!coll.getField('name')) {
    ctx.throw(400, `Collection '${collectionName}' must have a 'name' field`);
  }
}
