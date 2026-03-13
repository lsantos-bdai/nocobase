import { Context, Next } from '@nocobase/actions';
import { DuplicateNamesError, DuplicateInfo } from '../errors/duplicate-names-error';
import {
  getPlatformOrThrow,
  getLookupRepoOrThrow,
  syncLookupCollection,
  getCollectionTitles,
  updateRegisteredCollections,
  validateCollectionHasNameField,
  resolveCollectionBasic,
} from '../utils';
import {
  collectRecordsFromCollections,
  findInternalDuplicates,
  findExternalDuplicates,
  insertRecordsToLookup,
} from '../utils';
import { PluginDatabridgeServer } from '../plugin';

export async function addPlatformCollections(ctx: Context, next: Next) {
  const platformIdentifier = ctx.action.params.platform || ctx.request.query.platform;
  const { collections = [] } = ctx.action.params.values || {};

  if (!platformIdentifier) {
    ctx.throw(400, 'platform parameter (id or slug) is required');
    return;
  }

  if (!collections || collections.length === 0) {
    ctx.throw(400, 'collections array is required and must not be empty');
    return;
  }

  const platformRecord = await getPlatformOrThrow(ctx, platformIdentifier);
  await syncLookupCollection(ctx, platformRecord);
  const lookupRepo = await getLookupRepoOrThrow(ctx, platformRecord);

  // Resolve collection names (supports case-insensitive title matching)
  const resolvedCollections: string[] = [];
  for (const collName of collections) {
    const resolved = await resolveCollectionBasic(ctx, ctx.db, collName);
    validateCollectionHasNameField(ctx, resolved);
    resolvedCollections.push(resolved);
  }

  // Collect all records from collections being added
  const newRecords = await collectRecordsFromCollections(ctx.db, resolvedCollections);

  // Check for internal duplicates (same name in multiple selected collections)
  const internalDuplicates = findInternalDuplicates(newRecords);

  // Check for external duplicates (conflicts with existing entries)
  const externalDuplicates = await findExternalDuplicates(lookupRepo, newRecords, resolvedCollections);

  if (internalDuplicates.length > 0 || externalDuplicates.length > 0) {
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

  const collectionTitles = await getCollectionTitles(ctx.db, resolvedCollections);

  // Clear existing entries for collections being added (re-sync)
  await lookupRepo.destroy({
    filter: { collection: { $in: resolvedCollections } },
  });

  const synced = await insertRecordsToLookup(lookupRepo, newRecords, collectionTitles);

  await updateRegisteredCollections(ctx, platformIdentifier, resolvedCollections, []);

  // Register hooks for newly added collections
  const databridgePlugin = ctx.app.pm.get('@rai/plugin-databridge') as PluginDatabridgeServer;
  for (const collName of resolvedCollections) {
    databridgePlugin.registerCollectionHooks(collName);
  }

  ctx.body = { synced, collections: resolvedCollections };
  ctx.withoutDataWrapping = true;
  await next();
}
