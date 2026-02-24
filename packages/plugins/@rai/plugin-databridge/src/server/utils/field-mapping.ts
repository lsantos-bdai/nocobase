import { Context } from '@nocobase/actions';
import { Collection, Field, Database } from '@nocobase/database';
import { Platform } from './platform-helpers';

/**
 * Normalize a field title to a snake_case key.
 * "Franka Hand Gripper" → "franka_hand_gripper"
 */
export function normalizeFieldName(title: string): string {
  return title.toLowerCase().replace(/\s+/g, '_');
}

/**
 * Build a mapping from normalized field names to Field objects.
 * This is used to reverse the transformation done in resolveData.
 */
export function buildFieldMapping(collection: Collection): Map<string, Field> {
  const mapping = new Map<string, Field>();
  const fields = collection.getFields();

  for (const field of fields) {
    const title = field.options?.title;
    // Skip auto-generated FK fields (no title, name starts with f_)
    if (!title && field.name.startsWith('f_')) continue;

    const key = normalizeFieldName(title || field.name);
    mapping.set(key, field);
  }

  return mapping;
}

/**
 * Look up an asset ID by name in the platform's lookup table.
 */
export async function lookupAssetIdByName(
  db: Database,
  platform: Platform,
  assetName: string,
): Promise<{ assetId: string; collection: string } | null> {
  const result = await db.getRepository(platform.collectionName).findOne({
    filter: { name: assetName },
  });

  if (!result) {
    return null;
  }

  return {
    assetId: result.assetId,
    collection: result.collection,
  };
}

/**
 * Resolve a relation value (asset name) to its ID.
 * Returns the asset ID if found, throws if not found.
 */
export async function resolveRelationToId(
  db: Database,
  platform: Platform,
  field: Field,
  assetName: string,
): Promise<number | string> {
  const lookup = await lookupAssetIdByName(db, platform, assetName);

  if (!lookup) {
    const fieldTitle = field.options?.title || field.name;
    throw new RelationNotFoundError(fieldTitle, assetName);
  }

  // Return as number if it looks like a number (most IDs are numeric)
  const numericId = parseInt(lookup.assetId, 10);
  return isNaN(numericId) ? lookup.assetId : numericId;
}

/**
 * Convert human-readable data back to internal database format.
 * Reverses the transformation done by resolveData in get.ts.
 *
 * @param collection The target collection
 * @param data Human-readable data with normalized field names
 * @param platform The platform for relation lookups
 * @param db Database instance
 * @returns Internal database format with original field names and IDs
 */
export async function unresolveData(
  collection: Collection,
  data: Record<string, unknown>,
  platform: Platform,
  db: Database,
): Promise<Record<string, unknown>> {
  const fieldMapping = buildFieldMapping(collection);
  const internal: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    // Skip metadata fields that shouldn't be updated
    if (key === 'createdat' || key === 'updatedat' || key === 'createdbyid' || key === 'updatedbyid') {
      continue;
    }

    const field = fieldMapping.get(key);

    // If no field found, check if it's a direct field name (like 'id', 'name')
    if (!field) {
      // Allow 'id' and 'name' through as-is since they're standard fields
      if (key === 'id' || key === 'name') {
        internal[key] = value;
      }
      // Skip unknown fields silently to allow partial updates
      continue;
    }

    if (field.isRelationField() && value != null) {
      // Resolve relation names to IDs
      const targetKey = field.options?.foreignKey || field.name;

      if (Array.isArray(value)) {
        // hasMany/belongsToMany - resolve each name to ID
        const ids: (number | string)[] = [];
        for (const item of value) {
          if (typeof item === 'string') {
            const id = await resolveRelationToId(db, platform, field, item);
            ids.push(id);
          } else {
            ids.push(item);
          }
        }
        internal[field.name] = ids;
      } else if (typeof value === 'string') {
        // belongsTo/hasOne - resolve single name to ID
        const id = await resolveRelationToId(db, platform, field, value);
        // For belongsTo, set the foreign key field
        if (field.type === 'belongsTo') {
          const fkField = field.options?.foreignKey || `${field.name}Id`;
          internal[fkField] = id;
        } else {
          internal[field.name] = id;
        }
      } else {
        // Value is already an ID or object
        internal[field.name] = value;
      }
    } else {
      // Non-relation field - use original field name
      internal[field.name] = value;
    }
  }

  return internal;
}

/**
 * Validate that required fields are present in the data.
 */
export function validateRequiredFields(
  collection: Collection,
  data: Record<string, unknown>,
  isCreate: boolean,
): string[] {
  const errors: string[] = [];
  const fieldMapping = buildFieldMapping(collection);

  for (const [normalizedName, field] of fieldMapping) {
    // Check if field is required (has allowNull: false in options)
    const isRequired =
      field.options?.allowNull === false ||
      field.options?.required === true ||
      (isCreate && normalizedName === 'name'); // name is always required for create

    if (isRequired) {
      const value = data[normalizedName];
      if (value === undefined || value === null || value === '') {
        const fieldTitle = field.options?.title || field.name;
        errors.push(`Field '${fieldTitle}' is required`);
      }
    }
  }

  return errors;
}

/**
 * Resolve a collection name or title to the internal collection name.
 */
export async function resolveCollectionName(
  ctx: Context,
  collectionIdentifier: string,
  registeredCollections: string[],
): Promise<string | null> {
  // Check if it's already an internal collection name
  if (registeredCollections.includes(collectionIdentifier)) {
    return collectionIdentifier;
  }

  // Try to find by title (case-insensitive)
  const collectionLower = collectionIdentifier.toLowerCase();
  const collectionRecords = await ctx.db.getRepository('collections').find({
    filter: { name: { $in: registeredCollections } },
    fields: ['name', 'title'],
  });

  const matchedCollection = collectionRecords.find(
    (c: any) => c.title?.toLowerCase() === collectionLower || c.name.toLowerCase() === collectionLower,
  );

  return matchedCollection?.name || null;
}

/**
 * Error thrown when a relation target is not found.
 */
export class RelationNotFoundError extends Error {
  public readonly field: string;
  public readonly value: string;

  constructor(field: string, value: string) {
    super(`Asset '${value}' not found for field '${field}'`);
    this.name = 'RelationNotFoundError';
    this.field = field;
    this.value = value;
  }
}

/**
 * Error thrown when validation fails.
 */
export class ValidationError extends Error {
  public readonly errors: string[];

  constructor(errors: string[]) {
    super(`Validation failed: ${errors.join(', ')}`);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

/**
 * Error thrown when an asset is not found.
 */
export class AssetNotFoundError extends Error {
  public readonly assetName: string;

  constructor(assetName: string) {
    super(`Asset '${assetName}' not found`);
    this.name = 'AssetNotFoundError';
    this.assetName = assetName;
  }
}
