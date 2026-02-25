import { Database, Collection } from '@nocobase/database';

export interface SchemaValidationError {
  collection: string;
  field: string;
  errorType: 'missing_field';
  snapshotValue: unknown;
  suggestion?: string;
}

export interface SchemaValidationResult {
  valid: boolean;
  errors: SchemaValidationError[];
}

const SKIP_FIELD_PREFIXES = ['_'];
const SKIP_FIELD_NAMES = new Set([
  'createdAt',
  'updatedAt',
  'createdBy',
  'updatedBy',
  'createdById',
  'updatedById',
]);

/**
 * Validates that all fields in rollback data exist in the current collection schema.
 * This prevents silent data loss when schemas have changed since the snapshot was taken.
 */
export function validateRollbackSchema(
  db: Database,
  collectionName: string,
  rollbackData: Record<string, unknown> | null,
): SchemaValidationResult {
  const errors: SchemaValidationError[] = [];

  // If rollbackData is null (delete action), no validation needed
  if (rollbackData === null) {
    return { valid: true, errors: [] };
  }

  const collection = db.getCollection(collectionName);
  if (!collection) {
    return { valid: true, errors: [] };
  }

  // Build set of valid field names from collection schema
  const validFields = buildValidFieldSet(collection);

  // Check each field in rollback data
  for (const [fieldName, fieldValue] of Object.entries(rollbackData)) {
    // Skip internal fields (prefixed with _)
    if (SKIP_FIELD_PREFIXES.some((prefix) => fieldName.startsWith(prefix))) {
      continue;
    }

    // Skip system fields
    if (SKIP_FIELD_NAMES.has(fieldName)) {
      continue;
    }

    // Check if field exists in schema
    if (!validFields.has(fieldName)) {
      const suggestion = findSimilarFieldName(fieldName, validFields);
      errors.push({
        collection: collectionName,
        field: fieldName,
        errorType: 'missing_field',
        snapshotValue: fieldValue,
        suggestion,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Builds a set of all valid field names for a collection,
 * including foreign keys from belongsTo associations.
 */
function buildValidFieldSet(collection: Collection): Set<string> {
  const validFields = new Set<string>();

  // Add all defined fields
  for (const [fieldName, field] of collection.fields) {
    validFields.add(fieldName);

    // For belongsTo associations, also accept the foreign key field
    if (field.type === 'belongsTo') {
      const foreignKey = field.options?.foreignKey;
      if (foreignKey) {
        validFields.add(foreignKey);
      }
    }

    // For hasOne/hasMany/belongsToMany, add the sourceKey if different from id
    if (['hasOne', 'hasMany', 'belongsToMany'].includes(field.type)) {
      const sourceKey = field.options?.sourceKey;
      if (sourceKey) {
        validFields.add(sourceKey);
      }
    }
  }

  // Add common fields that might be on all models but not explicitly defined
  validFields.add('id');

  return validFields;
}

/**
 * Finds a similar field name from valid fields that might be a rename.
 * Uses simple heuristics like checking for common prefixes/suffixes.
 */
function findSimilarFieldName(
  missingField: string,
  validFields: Set<string>,
): string | undefined {
  const missingLower = missingField.toLowerCase();

  for (const validField of validFields) {
    const validLower = validField.toLowerCase();

    // Check if one contains the other (likely a rename with prefix/suffix change)
    if (
      validLower.includes(missingLower) ||
      missingLower.includes(validLower)
    ) {
      return `Field may have been renamed to '${validField}'`;
    }

    // Check for common patterns like _id suffix changes
    const missingBase = missingField.replace(/_id$|Id$/, '');
    const validBase = validField.replace(/_id$|Id$/, '');
    if (
      missingBase.toLowerCase() === validBase.toLowerCase() &&
      missingField !== validField
    ) {
      return `Field may have been renamed to '${validField}'`;
    }
  }

  return undefined;
}
