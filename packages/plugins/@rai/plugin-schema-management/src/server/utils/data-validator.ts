import type { Context } from '@nocobase/actions';
import type { ClassifiedChange, ClassifiedChanges } from './diff-classifier';

/**
 * Warning about data that would be affected by a migration
 */
export interface ValidationWarning {
  type: 'null_values' | 'duplicates' | 'invalid_enum' | 'referenced_data';
  field: string;
  message: string;
  count: number;
  samples?: unknown[];
}

/**
 * Result of validating migration changes against actual data
 */
export interface ValidationResult {
  warnings: ValidationWarning[];
  canProceed: boolean;
}

/**
 * Validate migration changes against actual data in the collection
 *
 * For each breaking change, check if the data would actually violate the new constraints:
 * - make_required: Check for NULL values
 * - add_unique: Check for duplicate values
 * - remove_enum: Check for values using removed options
 */
export async function validateMigration(
  ctx: Context,
  collectionName: string,
  changes: ClassifiedChanges
): Promise<ValidationResult> {
  const warnings: ValidationWarning[] = [];

  // Get the collection
  const collection = ctx.db.getCollection(collectionName);
  if (!collection) {
    return { warnings: [], canProceed: true };
  }

  const repository = ctx.db.getRepository(collectionName);

  // Validate each breaking change
  for (const change of changes.breaking) {
    const warning = await validateSingleChange(repository, change);
    if (warning) {
      warnings.push(warning);
    }
  }

  return {
    warnings,
    canProceed: warnings.length === 0,
  };
}

/**
 * Validate a single breaking change against data
 */
async function validateSingleChange(
  repository: any,
  change: ClassifiedChange
): Promise<ValidationWarning | null> {
  switch (change.type) {
    case 'make_required':
      return validateMakeRequired(repository, change.field);

    case 'add_unique':
      return validateAddUnique(repository, change.field);

    case 'remove_enum':
      return validateRemoveEnum(repository, change.field, change.details?.removedValue as string);

    default:
      return null;
  }
}

/**
 * Check for NULL values before making a field required
 */
async function validateMakeRequired(
  repository: any,
  fieldName: string
): Promise<ValidationWarning | null> {
  try {
    // Count rows where field is NULL
    const count = await repository.count({
      filter: {
        [fieldName]: null,
      },
    });

    if (count > 0) {
      return {
        type: 'null_values',
        field: fieldName,
        message: `${count} row(s) have NULL values for "${fieldName}". These must be filled before making the field required.`,
        count,
      };
    }
  } catch (error) {
    // Field might not exist yet or other issues - skip validation
  }

  return null;
}

/**
 * Check for duplicate values before adding unique constraint
 */
async function validateAddUnique(
  repository: any,
  fieldName: string
): Promise<ValidationWarning | null> {
  try {
    // Use raw query to find duplicates
    // GROUP BY field HAVING COUNT(*) > 1
    const db = repository.database;
    const collection = repository.collection;
    const tableName = collection.model.tableName;

    // Sequelize raw query to find duplicates
    const [results] = await db.sequelize.query(`
      SELECT "${fieldName}", COUNT(*) as cnt
      FROM "${tableName}"
      WHERE "${fieldName}" IS NOT NULL
      GROUP BY "${fieldName}"
      HAVING COUNT(*) > 1
      LIMIT 10
    `);

    if (results && results.length > 0) {
      const totalDuplicates = results.reduce((sum: number, r: any) => sum + parseInt(r.cnt, 10), 0);
      const samples = results.slice(0, 5).map((r: any) => r[fieldName]);

      return {
        type: 'duplicates',
        field: fieldName,
        message: `${totalDuplicates} row(s) have duplicate values for "${fieldName}". Duplicates must be resolved before adding unique constraint.`,
        count: totalDuplicates,
        samples,
      };
    }
  } catch (error) {
    // Field might not exist yet or other issues - skip validation
  }

  return null;
}

/**
 * Check for values using a removed enum option
 */
async function validateRemoveEnum(
  repository: any,
  fieldName: string,
  removedValue: string
): Promise<ValidationWarning | null> {
  if (!removedValue) {
    return null;
  }

  try {
    // Count rows using the removed enum value
    const count = await repository.count({
      filter: {
        [fieldName]: removedValue,
      },
    });

    if (count > 0) {
      return {
        type: 'invalid_enum',
        field: fieldName,
        message: `${count} row(s) use the value "${removedValue}" for "${fieldName}". These must be updated before removing this enum option.`,
        count,
        samples: [removedValue],
      };
    }
  } catch (error) {
    // Field might not exist yet or other issues - skip validation
  }

  return null;
}

/**
 * Validate multiple enum values being removed
 */
export async function validateRemoveEnumValues(
  ctx: Context,
  collectionName: string,
  fieldName: string,
  removedValues: string[]
): Promise<ValidationWarning[]> {
  const warnings: ValidationWarning[] = [];
  const repository = ctx.db.getRepository(collectionName);

  for (const value of removedValues) {
    const warning = await validateRemoveEnum(repository, fieldName, value);
    if (warning) {
      warnings.push(warning);
    }
  }

  return warnings;
}
