import { Context, Next } from '@nocobase/actions';
import * as yaml from 'js-yaml';
import { diffSpecs } from 'openapi-diff';
import {
  classifyChanges,
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
  force?: boolean;
}

interface MigrateResponse {
  success: boolean;
  fieldsAdded: string[];
  fieldsModified: string[];
  fieldsSkipped: string[];
  errors: string[];
  warnings: string[];
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
  const { collection: collectionName, spec: newSpecYaml, force = false } = body;

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

    const diffResult = await diffSpecs({
      sourceSpec: { content: JSON.stringify(currentSpec), location: 'current', format: 'openapi3' },
      destinationSpec: { content: JSON.stringify(newSpec), location: 'new', format: 'openapi3' },
    });

    const changes = classifyChanges(diffResult, ctx);

    // Check for breaking changes
    if (!canAutoApply(changes) && !force) {
      // Validate data to provide helpful warnings
      const validationResult = await validateMigration(ctx, resolvedName, changes);

      result.errors.push(
        `Migration contains ${changes.breaking.length} breaking change(s). ` +
        `Use force=true to apply anyway, or export data first.`
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

      // Handle field removals (only if force=true)
      if (force) {
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
      });

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
