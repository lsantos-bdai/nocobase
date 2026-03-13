import { Collection, Database } from '@nocobase/database';
import { RelationDescriptor } from '../types/basic-asset-payload';
import { buildFieldMapping, normalizeFieldName } from './field-mapping';

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
 * Unknown keys are passed through as-is (supports direct field names like 'id').
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
