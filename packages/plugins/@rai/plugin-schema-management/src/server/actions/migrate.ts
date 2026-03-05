import { Context, Next } from '@nocobase/actions';
import * as yaml from 'js-yaml';
import {
  diffSchemas,
  canAutoApply,
  validateMigration,
  parseOpenAPISpec,
  mapFieldToOpenAPI,
  normalizeFieldName,
  type ClassifiedChange,
  type FieldMapperContext,
  type FieldSchema,
} from '../utils';

// System fields that are auto-generated
const SYSTEM_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'createdBy',
  'updatedBy',
  'createdById',
  'updatedById',
  'id',
]);

interface MigrateRequest {
  collection: string;
  spec: string;
  data?: string; // JSONL data for breaking change migrations
}

interface MigrateResponse {
  success: boolean;
  fieldsAdded: string[];
  fieldsModified: string[];
  fieldsSkipped: string[];
  errors: string[];
  warnings: string[];
  // Data import stats (when data is provided)
  dataImport?: {
    recordsImported: number;
    recordsUpdated: number;
  };
}

interface DataValidationResult {
  valid: boolean;
  errors: string[];
  records: Record<string, unknown>[];
}

/**
 * Generate current OpenAPI spec for diffing
 */
async function generateCurrentSpec(ctx: Context, collectionName: string): Promise<string> {
  let collection = ctx.db.getCollection(collectionName);
  let collMeta;

  if (!collection) {
    collMeta = await ctx.db.getRepository('collections').findOne({
      filter: { title: collectionName },
    });
    if (collMeta) {
      collection = ctx.db.getCollection(collMeta.name);
    }
  }

  if (!collection) {
    throw new Error(`Collection '${collectionName}' not found`);
  }

  if (!collMeta) {
    collMeta = await ctx.db.getRepository('collections').findOne({
      filter: { name: collection.name },
    });
  }
  const title = collMeta?.title || collectionName;

  const allCollections = await ctx.db.getRepository('collections').find({
    fields: ['name', 'title'],
  });
  const collectionTitleMap = new Map<string, string>();
  for (const coll of allCollections) {
    collectionTitleMap.set(coll.name, coll.title || coll.name);
  }

  const mapperContext: FieldMapperContext = { collectionTitleMap };
  const fields = collection.getFields();
  const properties: Record<string, any> = {};
  const required: string[] = [];

  for (const field of fields) {
    const fieldSchema = mapFieldToOpenAPI(field, mapperContext);
    if (fieldSchema) {
      const fieldTitle = field.options?.uiSchema?.title || field.options?.title;
      const fieldName = normalizeFieldName(field.name, fieldTitle);
      properties[fieldName] = fieldSchema;

      if (!SYSTEM_FIELDS.has(field.name) && (field.options?.primaryKey || field.options?.allowNull === false)) {
        required.push(fieldName);
      }
    }
  }

  const schemaObject: Record<string, any> = {
    type: 'object',
    properties,
    ...(required.length > 0 && { required }),
  };

  const inherits = collection.options?.inherits;
  if (inherits) {
    const parents = Array.isArray(inherits) ? inherits : [inherits];
    const uniqueParents = [...new Set(parents)];
    schemaObject['x-inherits'] = uniqueParents.map((name: string) => collectionTitleMap.get(name) || name);
  }

  schemaObject['x-title-field'] = collection.options?.titleField || 'id';

  const spec = {
    openapi: '3.1.0',
    info: { title, version: '1.0.0' },
    components: { schemas: { [title]: schemaObject } },
  };

  return yaml.dump(spec, { lineWidth: -1 });
}

/**
 * Migrate action - apply schema changes to an existing collection
 *
 * POST /api/schema-management:migrate
 * Body: { collection: string, spec: string, force?: boolean }
 *
 * Returns:
 * - success: boolean
 * - fieldsAdded: new fields created
 * - fieldsModified: existing fields updated
 * - fieldsSkipped: fields that couldn't be processed
 * - errors: error messages
 * - warnings: non-fatal issues
 */
export async function migrate(ctx: Context, next: Next) {
  const body = (ctx.request.body || ctx.action.params.values || {}) as MigrateRequest;
  const { collection: collectionName, spec: newSpecYaml, data: jsonlData } = body;

  if (!collectionName) {
    ctx.throw(400, 'collection parameter is required');
  }

  if (!newSpecYaml) {
    ctx.throw(400, 'spec parameter is required (YAML string)');
  }

  // Resolve collection
  let collection = ctx.db.getCollection(collectionName);
  let resolvedName = collectionName;
  let collMeta;

  if (!collection) {
    collMeta = await ctx.db.getRepository('collections').findOne({
      filter: { title: collectionName },
    });
    if (collMeta) {
      collection = ctx.db.getCollection(collMeta.name);
      resolvedName = collMeta.name;
    }
  }

  if (!collection) {
    ctx.throw(404, `Collection '${collectionName}' not found`);
  }

  const result: MigrateResponse = {
    success: false,
    fieldsAdded: [],
    fieldsModified: [],
    fieldsSkipped: [],
    errors: [],
    warnings: [],
  };

  try {
    // Generate current spec and diff
    const currentSpecYaml = await generateCurrentSpec(ctx, resolvedName);
    const currentSpec = yaml.load(currentSpecYaml) as any;
    const newSpec = yaml.load(newSpecYaml) as any;

    // Use custom schema diff that properly detects x-* additions and required changes
    const changes = diffSchemas(currentSpec, newSpec);
    const hasBreakingChanges = !canAutoApply(changes);

    // Check for breaking changes - require data for breaking migrations
    if (hasBreakingChanges && !jsonlData) {
      // Validate existing data to provide helpful warnings
      const validationResult = await validateMigration(ctx, resolvedName, changes);

      result.errors.push(
        `Migration contains ${changes.breaking.length} breaking change(s). ` +
        `Export your data, fix the violations, and re-import with the fixed data.`
      );

      if (validationResult.warnings.length > 0) {
        for (const warning of validationResult.warnings) {
          result.warnings.push(warning.message);
        }
      }

      // List breaking changes
      for (const change of changes.breaking) {
        result.warnings.push(`BREAKING: ${change.description}`);
      }

      ctx.body = result;
      return await next();
    }

    // If data is provided, validate it against the NEW schema constraints
    let parsedRecords: Record<string, unknown>[] = [];
    if (jsonlData) {
      const dataValidation = validateDataAgainstSchema(jsonlData, newSpec, changes);
      if (!dataValidation.valid) {
        result.errors.push('Imported data does not satisfy the new schema constraints:');
        result.errors.push(...dataValidation.errors);
        ctx.body = result;
        return await next();
      }
      parsedRecords = dataValidation.records;
    }

    // Parse new spec to get field definitions
    const { schema: newSchema, errors: parseErrors } = parseOpenAPISpec(newSpecYaml);

    if (parseErrors.length > 0) {
      result.errors = parseErrors;
      ctx.body = result;
      return await next();
    }

    // Build title -> internal name map
    const titleToName = new Map<string, string>();
    const existingCollections = await ctx.db.getRepository('collections').find({
      fields: ['name', 'title'],
    });
    for (const coll of existingCollections) {
      titleToName.set(coll.title || coll.name, coll.name);
      titleToName.set(coll.name, coll.name);
    }

    // Get existing fields
    const existingFields = collection.getFields();
    const existingFieldNames = new Set(existingFields.map((f) => f.name));

    // Filter out system fields
    const fieldsToProcess = newSchema.fields.filter((f) => !SYSTEM_FIELDS.has(f.name));

    // Execute migration in transaction
    const transaction = await ctx.db.sequelize.transaction();

    try {
      // Process each field from new spec
      for (const field of fieldsToProcess) {
        if (existingFieldNames.has(field.name)) {
          // Field exists - update it
          const updateResult = await updateField(ctx, resolvedName, field, titleToName, transaction);
          if (updateResult.success) {
            result.fieldsModified.push(field.name);
          } else {
            result.fieldsSkipped.push(field.name);
            if (updateResult.error) {
              result.warnings.push(`Field '${field.name}': ${updateResult.error}`);
            }
          }
        } else {
          // New field - create it
          const createResult = await createField(ctx, resolvedName, field, titleToName, transaction);
          if (createResult.success) {
            result.fieldsAdded.push(field.name);
          } else {
            result.fieldsSkipped.push(field.name);
            if (createResult.error) {
              result.warnings.push(`Field '${field.name}': ${createResult.error}`);
            }
          }
        }
      }

      // Handle field removals when data is provided (we're replacing all data anyway)
      if (parsedRecords.length > 0) {
        for (const change of changes.breaking) {
          if (change.type === 'remove_field' && existingFieldNames.has(change.field)) {
            try {
              await ctx.db.getRepository('fields').destroy({
                filter: {
                  collectionName: resolvedName,
                  name: change.field,
                },
                transaction,
              });
              result.warnings.push(`Removed field '${change.field}'`);
            } catch (e: any) {
              result.warnings.push(`Failed to remove field '${change.field}': ${e.message}`);
            }
          }
        }
      }

      // Update collection title if changed
      const titleChange = [...changes.nonBreaking, ...changes.breaking].find(
        (c) => c.type === 'change_collection_title'
      );
      if (titleChange && titleChange.details?.newValue) {
        await ctx.db.getRepository('collections').update({
          filter: { name: resolvedName },
          values: { title: titleChange.details.newValue },
          transaction,
        });
      }

      // Update collection metadata if titleField changed
      const titleFieldChange = changes.nonBreaking.find((c) => c.type === 'change_metadata' && c.field === 'titleField');
      if (titleFieldChange && titleFieldChange.details?.newValue) {
        await ctx.db.getRepository('collections').update({
          filter: { name: resolvedName },
          values: { titleField: titleFieldChange.details.newValue },
          transaction,
        });
      }

      // Sync collection to apply schema changes to PostgreSQL
      await collection.sync({
        transaction,
        force: false,
        alter: { drop: false },
      } as any);

      // If data was provided, update existing records by ID
      if (parsedRecords.length > 0) {
        const repository = ctx.db.getRepository(resolvedName);
        let recordsUpdated = 0;

        for (let i = 0; i < parsedRecords.length; i++) {
          const record = parsedRecords[i];
          const recordId = record.id;

          if (recordId === undefined || recordId === null) {
            throw new Error(`Record at index ${i}: missing 'id' field - all records must have an id for updates`);
          }

          try {
            // Update the existing record by ID
            const [affectedCount] = await repository.update({
              filter: { id: recordId },
              values: record,
              transaction,
            });

            if (affectedCount === 0) {
              // Record doesn't exist - could create it, but for now warn
              result.warnings.push(`Record id=${recordId}: not found in database, skipped`);
            } else {
              recordsUpdated++;
            }
          } catch (recordError: any) {
            // Extract detailed validation error info
            let errorDetail = recordError.message;

            // Sequelize validation errors have more details
            if (recordError.errors && Array.isArray(recordError.errors)) {
              const details = recordError.errors.map((e: any) =>
                `${e.path}: ${e.message}${e.value !== undefined ? ` (value: ${JSON.stringify(e.value)})` : ''}`
              ).join('; ');
              errorDetail = details;
            }

            throw new Error(`Record id=${recordId}: ${errorDetail}`);
          }
        }

        result.dataImport = {
          recordsUpdated,
          recordsImported: parsedRecords.length,
        };
      }

      await transaction.commit();
      result.success = true;
    } catch (e: any) {
      await transaction.rollback();
      result.errors.push(`Migration failed: ${e.message}`);
    }
  } catch (error: any) {
    result.errors.push(`Migration failed: ${error.message}`);
  }

  ctx.body = result;
  await next();
}

/**
 * Create a new field in the collection
 */
async function createField(
  ctx: Context,
  collectionName: string,
  field: FieldSchema,
  titleToName: Map<string, string>,
  transaction: any
): Promise<{ success: boolean; error?: string }> {
  try {
    const isRelationField = ['belongsTo', 'belongsToMany', 'hasMany', 'hasOne'].includes(field.type);

    const fieldValues: Record<string, unknown> = {
      collectionName,
      ...field,
    };

    // Resolve relation target
    if (isRelationField && field.target) {
      const targetName = titleToName.get(field.target);
      if (!targetName) {
        return { success: false, error: `Relation target '${field.target}' not found` };
      }
      fieldValues.target = targetName;
    }

    const fieldModel = await ctx.db.getRepository('fields').create({
      values: fieldValues,
      context: ctx,
      transaction,
    });

    // Load field to bind it to the collection's Sequelize model
    await fieldModel.load({ transaction });

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/**
 * Update an existing field in the collection
 */
async function updateField(
  ctx: Context,
  collectionName: string,
  field: FieldSchema,
  titleToName: Map<string, string>,
  transaction: any
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get existing field model
    const existingFieldModel = await ctx.db.getRepository('fields').findOne({
      filter: {
        collectionName,
        name: field.name,
      },
      transaction,
    });

    if (!existingFieldModel) {
      return { success: false, error: 'Field not found in database' };
    }

    // Build update values - only update what's changed
    const updateValues: Record<string, unknown> = {};

    // Update allowNull
    if (field.allowNull !== undefined && field.allowNull !== existingFieldModel.allowNull) {
      updateValues.allowNull = field.allowNull;
    }

    // Update unique constraint
    if (field.unique !== undefined && field.unique !== existingFieldModel.unique) {
      updateValues.unique = field.unique;
    }

    // Update default value
    if (field.defaultValue !== undefined && field.defaultValue !== existingFieldModel.defaultValue) {
      updateValues.defaultValue = field.defaultValue;
    }

    // Update validation rules
    if (field.validation) {
      updateValues.validation = field.validation;
    }

    // Update uiSchema (title, enum values, etc.)
    if (field.uiSchema) {
      updateValues.uiSchema = {
        ...existingFieldModel.uiSchema,
        ...field.uiSchema,
      };
    }

    // Only update if there are changes
    if (Object.keys(updateValues).length > 0) {
      await ctx.db.getRepository('fields').update({
        filter: {
          collectionName,
          name: field.name,
        },
        values: updateValues,
        transaction,
      });

      // Reload the field
      const collection = ctx.db.getCollection(collectionName);
      const updatedField = collection.getField(field.name);
      if (updatedField) {
        await (updatedField as any).load?.({ transaction });
      }
    }

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/**
 * Validate imported JSONL data against the new schema constraints
 */
function validateDataAgainstSchema(
  jsonlData: string,
  newSpec: any,
  changes: { breaking: ClassifiedChange[] }
): DataValidationResult {
  const errors: string[] = [];
  const records: Record<string, unknown>[] = [];

  // Parse JSONL
  const lines = jsonlData.split('\n').filter((line) => line.trim());
  for (let i = 0; i < lines.length; i++) {
    try {
      const record = JSON.parse(lines[i]);
      if (typeof record !== 'object' || record === null || Array.isArray(record)) {
        errors.push(`Line ${i + 1}: Expected a JSON object`);
        continue;
      }
      records.push(record);
    } catch (err: any) {
      errors.push(`Line ${i + 1}: Invalid JSON - ${err.message}`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors: errors.slice(0, 10), records: [] };
  }

  if (records.length === 0) {
    errors.push('No valid records found in imported data');
    return { valid: false, errors, records: [] };
  }

  // Extract schema constraints from newSpec
  const schemas = newSpec?.components?.schemas || {};
  const schemaName = Object.keys(schemas)[0];
  const schema = schemas[schemaName];

  if (!schema) {
    return { valid: true, errors: [], records }; // Can't validate without schema
  }

  const requiredFields = new Set<string>(schema.required || []);
  const properties = schema.properties || {};

  // Find unique constraints from breaking changes
  const uniqueFields = new Set<string>();
  for (const change of changes.breaking) {
    if (change.type === 'add_unique') {
      uniqueFields.add(change.field);
    }
  }

  // Validate required fields - check for nulls
  for (const field of requiredFields) {
    if (SYSTEM_FIELDS.has(field)) continue;

    const nullCount = records.filter((r) => r[field] === null || r[field] === undefined).length;
    if (nullCount > 0) {
      errors.push(`Field "${field}" is required but ${nullCount} record(s) have null/undefined values`);
    }
  }

  // Validate unique constraints - check for duplicates
  for (const field of uniqueFields) {
    const values = records.map((r) => r[field]).filter((v) => v !== null && v !== undefined);
    const seen = new Map<unknown, number>();

    for (const value of values) {
      seen.set(value, (seen.get(value) || 0) + 1);
    }

    const duplicates = Array.from(seen.entries()).filter(([, count]) => count > 1);
    if (duplicates.length > 0) {
      const samples = duplicates.slice(0, 3).map(([val]) => String(val)).join(', ');
      const totalDupes = duplicates.reduce((sum, [, count]) => sum + count, 0);
      errors.push(`Field "${field}" must be unique but ${totalDupes} record(s) have duplicate values (e.g., ${samples})`);
    }
  }

  // Validate enum values
  for (const [fieldName, prop] of Object.entries(properties) as [string, any][]) {
    if (prop.enum && Array.isArray(prop.enum)) {
      const allowedValues = new Set(prop.enum);
      const invalidRecords = records.filter((r) => {
        const value = r[fieldName];
        return value !== null && value !== undefined && !allowedValues.has(value);
      });

      if (invalidRecords.length > 0) {
        const samples = invalidRecords.slice(0, 3).map((r) => String(r[fieldName])).join(', ');
        errors.push(`Field "${fieldName}" has ${invalidRecords.length} record(s) with invalid enum values (e.g., ${samples})`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors.slice(0, 10),
    records,
  };
}
