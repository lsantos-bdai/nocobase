import { Context, Next } from '@nocobase/actions';

interface DuplicateInfo {
  withinNewCollections: { name: string; collections: string[] }[];
  withExistingEntries: { name: string; collection: string }[];
}

export async function syncPlatform(ctx: Context, next: Next) {
  const { filterByTk } = ctx.action.params;
  const { collections: collectionsToAdd = [], collectionsToRemove = [] } = ctx.action.params.values || {};

  if (!filterByTk) {
    ctx.throw(400, 'filterByTk (platform id) is required');
  }

  // Get platform from directory
  const platform = await ctx.db.getRepository('databridge_platforms').findOne({
    filterByTk,
  });

  if (!platform) {
    ctx.throw(404, 'Platform not found');
  }

  // Ensure the lookup collection table exists
  const lookupCollection = ctx.db.getCollection(platform.collectionName);
  if (!lookupCollection) {
    ctx.throw(500, `Lookup collection '${platform.collectionName}' not found. Please recreate the platform.`);
  }
  await lookupCollection.sync();

  const lookupRepo = ctx.db.getRepository(platform.collectionName);
  const platformsRepo = ctx.db.getRepository('databridge_platforms');

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
    // Update registeredCollections
    const currentCollections: string[] = platform.registeredCollections || [];
    const newRegistered = currentCollections.filter((c: string) => !collectionsToRemove.includes(c));
    await platformsRepo.update({
      filterByTk,
      values: { registeredCollections: newRegistered },
    });

    ctx.body = {
      synced: 0,
      removed,
    };
    await next();
    return;
  }

  // Validate all collections to add exist and have 'name' field
  for (const collName of collectionsToAdd) {
    const coll = ctx.db.getCollection(collName);
    if (!coll) {
      ctx.throw(400, `Collection '${collName}' does not exist`);
    }
    if (!coll.getField('name')) {
      ctx.throw(400, `Collection '${collName}' must have a 'name' field`);
    }
  }

  // Step 1: Collect all names from collections being ADDED
  const newRecords: { name: string; collection: string; assetId: string }[] = [];
  for (const collName of collectionsToAdd) {
    const records = await ctx.db.getRepository(collName).find({
      fields: ['id', 'name'],
    });
    for (const record of records) {
      if (!record.name) continue;
      newRecords.push({
        name: record.name,
        collection: collName,
        assetId: String(record.id),
      });
    }
  }

  // Step 2: Check duplicates WITHIN new records (same name in multiple collections)
  const nameToCollections = new Map<string, string[]>();
  for (const { name, collection } of newRecords) {
    if (!nameToCollections.has(name)) {
      nameToCollections.set(name, []);
    }
    nameToCollections.get(name)!.push(collection);
  }
  const internalDuplicates = [...nameToCollections.entries()]
    .filter(([_, colls]) => colls.length > 1)
    .map(([name, colls]) => ({ name, collections: colls }));

  // Step 3: Check duplicates AGAINST existing platform entries
  // Exclude collections being replaced/added (they'll be cleared first)
  const existingEntries = await lookupRepo.find({
    filter: { collection: { $notIn: collectionsToAdd } },
    fields: ['name', 'collection'],
  });
  const existingNameMap = new Map<string, string>();
  for (const entry of existingEntries) {
    existingNameMap.set(entry.name, entry.collection);
  }
  const externalDuplicates = newRecords
    .filter((r) => existingNameMap.has(r.name))
    .map((r) => ({
      name: r.name,
      collection: r.collection,
      existingCollection: existingNameMap.get(r.name)!,
    }));

  // Step 4: If any duplicates, return detailed error
  if (internalDuplicates.length > 0 || externalDuplicates.length > 0) {
    const duplicates: DuplicateInfo = {
      withinNewCollections: internalDuplicates,
      withExistingEntries: externalDuplicates.map((d) => ({ name: d.name, collection: d.collection })),
    };
    ctx.throw(400, 'Duplicate asset names found', { duplicates });
  }

  // Look up collection titles
  const collectionRecords = await ctx.db.getRepository('collections').find({
    filter: { name: { $in: collectionsToAdd } },
    fields: ['name', 'title'],
  });
  const collectionTitles: Record<string, string> = {};
  for (const coll of collectionRecords) {
    collectionTitles[coll.name] = coll.title || coll.name;
  }

  // Step 5: No duplicates - proceed with sync
  // Clear existing entries for collections being added
  await lookupRepo.destroy({
    filter: { collection: { $in: collectionsToAdd } },
  });

  // Insert all new records
  let synced = 0;
  for (const record of newRecords) {
    await lookupRepo.create({
      values: {
        name: record.name,
        collection: record.collection,
        collectionTitle: collectionTitles[record.collection] || record.collection,
        assetId: record.assetId,
      },
    });
    synced++;
  }

  // Update registeredCollections
  const currentCollections: string[] = platform.registeredCollections || [];
  const updatedCollections = new Set(currentCollections);
  for (const c of collectionsToRemove) {
    updatedCollections.delete(c);
  }
  for (const c of collectionsToAdd) {
    updatedCollections.add(c);
  }
  await platformsRepo.update({
    filterByTk,
    values: { registeredCollections: [...updatedCollections] },
  });

  ctx.body = {
    synced,
    removed,
  };

  await next();
}
