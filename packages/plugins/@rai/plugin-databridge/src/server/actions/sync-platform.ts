import { Context, Next } from '@nocobase/actions';
import { DuplicateNamesError, DuplicateInfo } from '../errors/duplicate-names-error';
import {
  getPlatformOrThrow,
  getLookupRepoOrThrow,
  syncLookupCollection,
  getCollectionTitles,
  updateRegisteredCollections,
  validateCollectionHasNameField,
} from '../utils';
import {
  collectRecordsFromCollections,
  findInternalDuplicates,
  findExternalDuplicates,
  insertRecordsToLookup,
} from '../utils';

export async function syncPlatform(ctx: Context, next: Next) {
  const { filterByTk } = ctx.action.params;
  const { collections: collectionsToAdd = [], collectionsToRemove = [] } = ctx.action.params.values || {};

  if (!filterByTk) {
    ctx.throw(400, 'filterByTk (platform id) is required');
  }

  const platform = await getPlatformOrThrow(ctx, filterByTk);
  await syncLookupCollection(ctx, platform);
  const lookupRepo = await getLookupRepoOrThrow(ctx, platform);

  // Handle removals first
  let removed = 0;
  if (collectionsToRemove.length > 0) {
    for (const collName of collectionsToRemove) {
      const deleted = await lookupRepo.destroy({
        filter: { collection: collName },
      });
      removed += typeof deleted === 'number' ? deleted : 0;
    }
  }

  // If no collections to add, just handle removals and update registeredCollections
  if (!collectionsToAdd || collectionsToAdd.length === 0) {
    await updateRegisteredCollections(ctx, filterByTk, [], collectionsToRemove);
    ctx.body = { synced: 0, removed };
    await next();
    return;
  }

  // Validate all collections to add exist and have 'name' field
  for (const collName of collectionsToAdd) {
    validateCollectionHasNameField(ctx, collName);
  }

  // Collect all records from collections being added
  const newRecords = await collectRecordsFromCollections(ctx.db, collectionsToAdd);

  // Check for internal duplicates (same name in multiple selected collections)
  const internalDuplicates = findInternalDuplicates(newRecords);

  // Check for external duplicates (conflicts with existing entries)
  const externalDuplicates = await findExternalDuplicates(lookupRepo, newRecords, collectionsToAdd);

  // If any duplicates, return detailed error with collection titles
  if (internalDuplicates.length > 0 || externalDuplicates.length > 0) {
    // Collect all collection names involved in duplicates
    const allCollNames = new Set<string>();
    for (const d of internalDuplicates) {
      d.collections.forEach((c) => allCollNames.add(c));
    }
    for (const d of externalDuplicates) {
      allCollNames.add(d.collection);
      allCollNames.add(d.existingCollection);
    }

    const titles = await getCollectionTitles(ctx.db, [...allCollNames]);

    const duplicates: DuplicateInfo = {
      withinNewCollections: internalDuplicates.map((d) => ({
        name: d.name,
        collections: d.collections.map((c) => titles[c] || c),
      })),
      withExistingEntries: externalDuplicates.map((d) => ({
        name: d.name,
        newCollection: titles[d.collection] || d.collection,
        existingCollection: titles[d.existingCollection] || d.existingCollection,
      })),
    };
    throw new DuplicateNamesError(duplicates);
  }

  // Get collection titles for insertion
  const collectionTitles = await getCollectionTitles(ctx.db, collectionsToAdd);

  // Clear existing entries for collections being added
  await lookupRepo.destroy({
    filter: { collection: { $in: collectionsToAdd } },
  });

  // Insert all new records
  const synced = await insertRecordsToLookup(lookupRepo, newRecords, collectionTitles);

  // Update registeredCollections
  await updateRegisteredCollections(ctx, filterByTk, collectionsToAdd, collectionsToRemove);

  ctx.body = { synced, removed };
  await next();
}
