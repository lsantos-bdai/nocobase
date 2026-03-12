import { Collection, Database } from '@nocobase/database';
import { BasicAssetPayload, RelationDescriptor } from '../types/basic-asset-payload';
import { buildFieldMapping, normalizeFieldName } from './field-mapping';
import { getCollectionTitle } from './platform-helpers';

/**
 * Options for fetchAssetsBasic.
 */
export interface FetchAssetsBasicOptions {
  getRelations?: boolean;
  relationDepth?: number;
}

/**
 * Resolve raw asset data to use human-readable field names.
 * Relation fields become RelationDescriptor objects.
 */
export function resolveDataBasic(
  collection: Collection,
  rawData: Record<string, unknown>,
  db: Database,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  const fields = collection.getFields();

  for (const field of fields) {
    const rawValue = rawData[field.name];
    if (rawValue === undefined) continue;

    // Skip auto-generated FK fields (no title, name starts with f_)
    const title = field.options?.title;
    if (!title && field.name.startsWith('f_')) continue;

    const key = normalizeFieldName(title || field.name);

    if (field.isRelationField() && rawValue != null) {
      // Build a RelationDescriptor
      const targetCollectionName = field.options?.target;
      const targetCollection = targetCollectionName ? db.getCollection(targetCollectionName) : null;
      const targetTitle = targetCollection?.options?.title || targetCollectionName || '';

      if (Array.isArray(rawValue)) {
        // hasMany/belongsToMany — array of related objects
        const ids: (number | string)[] = [];
        const names: string[] = [];
        for (const item of rawValue) {
          if (item && typeof item === 'object') {
            if (item.id !== undefined) ids.push(item.id);
            if (typeof item.name === 'string') names.push(item.name);
          }
        }
        const descriptor: RelationDescriptor = {
          collection: targetCollectionName || '',
          collection_title: targetTitle,
          id: ids,
          name: names,
        };
        resolved[key] = descriptor;
      } else if (typeof rawValue === 'object' && rawValue !== null) {
        // belongsTo/hasOne — single related object
        const obj = rawValue as Record<string, unknown>;
        const ids: (number | string)[] = obj.id !== undefined ? [obj.id as number | string] : [];
        const names: string[] = typeof obj.name === 'string' ? [obj.name] : [];
        const descriptor: RelationDescriptor = {
          collection: targetCollectionName || '',
          collection_title: targetTitle,
          id: ids,
          name: names,
        };
        resolved[key] = descriptor;
      } else {
        // Raw scalar (shouldn't happen with appends, but fallback)
        resolved[key] = rawValue;
      }
    } else {
      resolved[key] = rawValue;
    }
  }

  return resolved;
}

/**
 * Map user-supplied filter keys (human-readable) to internal field names.
 * Unknown keys are passed through as-is (may be direct field names like 'id').
 */
export function mapFilterKeys(
  collection: Collection,
  filter: Record<string, unknown>,
): Record<string, unknown> {
  const fieldMapping = buildFieldMapping(collection);
  const mapped: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(filter)) {
    const field = fieldMapping.get(key);
    if (field) {
      mapped[field.name] = value;
    } else {
      // Pass through as-is (supports direct field names like 'id', 'name')
      mapped[key] = value;
    }
  }

  return mapped;
}

/**
 * Key for deduplication: collection name + record ID.
 */
function dedupeKey(collectionName: string, id: number | string): string {
  return `${collectionName}::${id}`;
}

/**
 * Extract all relation descriptors from resolved data for BFS traversal.
 */
function extractRelationDescriptors(data: Record<string, unknown>): RelationDescriptor[] {
  const descriptors: RelationDescriptor[] = [];
  for (const value of Object.values(data)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>;
      if (obj.collection && obj.id && Array.isArray(obj.id)) {
        descriptors.push(obj as unknown as RelationDescriptor);
      }
    }
  }
  return descriptors;
}

interface BfsItem {
  collectionName: string;
  id: number | string;
  depth: number;
}

/**
 * Fetch assets from a collection using a filter, with relation descriptors and optional BFS expansion.
 *
 * 1. Maps filter keys to internal field names
 * 2. Queries the collection with eager-loaded relations
 * 3. Transforms relation fields to RelationDescriptor objects
 * 4. If get_relations=true, BFS-appends related records as separate BasicAssetPayload items (deduplicated)
 *
 * @param db              Database instance
 * @param collectionName  Resolved internal collection name
 * @param filter          User-supplied filter (human-readable keys)
 * @param options         Relation traversal options
 * @returns Array of BasicAssetPayload (primary results first, then related assets)
 */
export async function fetchAssetsBasic(
  db: Database,
  collectionName: string,
  filter: Record<string, unknown>,
  options: FetchAssetsBasicOptions = {},
): Promise<BasicAssetPayload[]> {
  const { getRelations = false, relationDepth = 1 } = options;

  const collection = db.getCollection(collectionName);
  if (!collection) {
    return [];
  }

  const collectionTitle = collection.options?.title || collectionName;

  // Map user-friendly filter keys to internal field names
  const internalFilter = mapFilterKeys(collection, filter);

  // Get relation fields for appends (eager-load related objects)
  const relationFields = collection
    .getFields()
    .filter((f) => f.isRelationField())
    .map((f) => f.name);

  // Query with filter
  const assets = await db.getRepository(collectionName).find({
    filter: internalFilter as any,
    appends: relationFields,
  });

  // Track seen records for deduplication
  const visited = new Set<string>();
  const results: BasicAssetPayload[] = [];

  // Process primary results
  const bfsQueue: BfsItem[] = [];

  for (const asset of assets) {
    const key = dedupeKey(collectionName, asset.id);
    if (visited.has(key)) continue;
    visited.add(key);

    const resolvedData = resolveDataBasic(collection, asset, db);

    results.push({
      collection: collectionName,
      collection_title: collectionTitle,
      data: resolvedData,
    });

    // Queue relation targets for BFS if enabled
    if (getRelations && relationDepth > 0) {
      const descriptors = extractRelationDescriptors(resolvedData);
      for (const desc of descriptors) {
        for (const id of desc.id) {
          const dKey = dedupeKey(desc.collection, id);
          if (!visited.has(dKey)) {
            bfsQueue.push({ collectionName: desc.collection, id, depth: 1 });
          }
        }
      }
    }
  }

  // BFS: expand relations level by level
  while (bfsQueue.length > 0) {
    const currentDepth = bfsQueue[0].depth;

    // Collect all items at this depth, grouped by collection
    const byCollection = new Map<string, (number | string)[]>();
    const itemsAtDepth: BfsItem[] = [];

    while (bfsQueue.length > 0 && bfsQueue[0].depth === currentDepth) {
      const item = bfsQueue.shift()!;
      const dKey = dedupeKey(item.collectionName, item.id);
      if (visited.has(dKey)) continue;
      visited.add(dKey);

      itemsAtDepth.push(item);
      const ids = byCollection.get(item.collectionName) || [];
      ids.push(item.id);
      byCollection.set(item.collectionName, ids);
    }

    // Fetch each collection group
    for (const [relCollectionName, ids] of byCollection) {
      const relCollection = db.getCollection(relCollectionName);
      if (!relCollection) continue;

      const relCollectionTitle = relCollection.options?.title || relCollectionName;
      const relRelationFields = relCollection
        .getFields()
        .filter((f) => f.isRelationField())
        .map((f) => f.name);

      const relAssets = await db.getRepository(relCollectionName).find({
        filter: { id: { $in: ids } },
        appends: relRelationFields,
      });

      for (const relAsset of relAssets) {
        const resolvedData = resolveDataBasic(relCollection, relAsset, db);

        results.push({
          collection: relCollectionName,
          collection_title: relCollectionTitle,
          data: resolvedData,
        });

        // Queue next level if within depth
        if (currentDepth < relationDepth) {
          const descriptors = extractRelationDescriptors(resolvedData);
          for (const desc of descriptors) {
            for (const id of desc.id) {
              const dKey = dedupeKey(desc.collection, id);
              if (!visited.has(dKey)) {
                bfsQueue.push({ collectionName: desc.collection, id, depth: currentDepth + 1 });
              }
            }
          }
        }
      }
    }
  }

  return results;
}

/**
 * Convert human-readable data to internal database format for basic (platform-free) mutations.
 *
 * Unlike the platform-scoped `unresolveData`, relation values must be raw FK IDs
 * (no name-to-ID resolution). The function maps normalized field names back to
 * internal field names and routes values to the correct DB columns.
 */
export async function unresolveDataBasic(
  collection: Collection,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const fieldMapping = buildFieldMapping(collection);
  const internal: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    // Skip metadata fields
    if (key === 'createdat' || key === 'updatedat' || key === 'createdbyid' || key === 'updatedbyid') {
      continue;
    }

    const field = fieldMapping.get(key);

    if (!field) {
      // Allow standard fields through as-is
      if (key === 'id' || key === 'name') {
        internal[key] = value;
      }
      // Skip unknown fields silently
      continue;
    }

    if (field.isRelationField() && value != null) {
      // For basic mode, relation values must be raw FK IDs (number or array of numbers)
      if (field.type === 'belongsTo') {
        // Set the foreign key field directly
        const fkField = field.options?.foreignKey || `${field.name}Id`;
        internal[fkField] = value;
      } else if (Array.isArray(value)) {
        // hasMany/belongsToMany — array of IDs
        internal[field.name] = value;
      } else {
        internal[field.name] = value;
      }
    } else {
      internal[field.name] = value;
    }
  }

  return internal;
}
