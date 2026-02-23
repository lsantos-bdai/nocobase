import { Repository } from '@nocobase/database';

export interface SyncRecord {
  id: string | number;
  name: string;
}

export interface SyncResult {
  synced: number;
  errors: string[];
}

/**
 * Sync records from a source collection to a lookup repository.
 * Handles duplicate detection and returns errors for duplicates.
 */
export async function syncRecordsToLookup(
  lookupRepo: Repository,
  records: SyncRecord[],
  collectionName: string,
  collectionTitle: string,
): Promise<SyncResult> {
  let synced = 0;
  const errors: string[] = [];

  for (const record of records) {
    if (!record.name) continue;

    try {
      await lookupRepo.create({
        values: {
          name: record.name,
          collection: collectionName,
          collectionTitle,
          assetId: String(record.id),
        },
      });
      synced++;
    } catch (err: any) {
      if (err.name === 'SequelizeUniqueConstraintError') {
        errors.push(`Duplicate name '${record.name}' from collection '${collectionTitle}'`);
      } else {
        throw err;
      }
    }
  }

  return { synced, errors };
}

/**
 * Build a list of new records from multiple collections.
 */
export interface NewRecord {
  name: string;
  collection: string;
  assetId: string;
}

export async function collectRecordsFromCollections(db: any, collectionNames: string[]): Promise<NewRecord[]> {
  const newRecords: NewRecord[] = [];

  for (const collName of collectionNames) {
    const records = await db.getRepository(collName).find({
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

  return newRecords;
}

/**
 * Find duplicates within a list of records (same name appearing in multiple collections).
 */
export function findInternalDuplicates(records: NewRecord[]): { name: string; collections: string[] }[] {
  const nameToCollections = new Map<string, string[]>();

  for (const { name, collection } of records) {
    if (!nameToCollections.has(name)) {
      nameToCollections.set(name, []);
    }
    nameToCollections.get(name)!.push(collection);
  }

  return [...nameToCollections.entries()]
    .filter(([_, colls]) => colls.length > 1)
    .map(([name, colls]) => ({ name, collections: colls }));
}

/**
 * Find duplicates between new records and existing entries in the lookup table.
 */
export interface ExternalDuplicate {
  name: string;
  collection: string;
  existingCollection: string;
}

export async function findExternalDuplicates(
  lookupRepo: Repository,
  newRecords: NewRecord[],
  excludeCollections: string[],
): Promise<ExternalDuplicate[]> {
  // Fetch existing entries not in the collections being added
  const existingEntries = await lookupRepo.find({
    filter: { collection: { $notIn: excludeCollections } },
    fields: ['name', 'collection'],
  });

  const existingNameMap = new Map<string, string>();
  for (const entry of existingEntries) {
    existingNameMap.set(entry.name, entry.collection);
  }

  return newRecords
    .filter((r) => existingNameMap.has(r.name))
    .map((r) => ({
      name: r.name,
      collection: r.collection,
      existingCollection: existingNameMap.get(r.name)!,
    }));
}

/**
 * Insert records into lookup table with collection titles.
 */
export async function insertRecordsToLookup(
  lookupRepo: Repository,
  records: NewRecord[],
  collectionTitles: Record<string, string>,
): Promise<number> {
  let synced = 0;
  for (const record of records) {
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
  return synced;
}
