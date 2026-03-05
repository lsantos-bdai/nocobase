import { Context, Next } from '@nocobase/actions';
import { parseOpenAPISpec, PRESET_FIELDS, type CollectionSchema, type FieldSchema } from '../utils/spec-parser';

// Fields that are auto-generated or handled specially - skip these during import
const RESERVED_FIELD_NAMES = new Set([
  'id',
  'createdAt',
  'updatedAt',
  'createdBy',
  'updatedBy',
  'createdById',
  'updatedById',
]);

/**
 * Detect system fields in the spec and return warnings
 * System fields are auto-generated and will be ignored during import
 */
function detectSystemFields(props: Record<string, any>): string[] {
  const detected: string[] = [];

  for (const fieldName of RESERVED_FIELD_NAMES) {
    if (props[fieldName]) {
      detected.push(fieldName);
    }
  }

  return detected;
}

interface ImportResult {
  success: boolean;
  collection?: {
    name: string;
    title: string;
  };
  fieldsCreated: string[];
  fieldsSkipped: string[];
  errors: string[];
  warnings: string[];
}

interface ImportSpecRequest {
  spec: string;
}

/**
 * Import an OpenAPI spec and create the collection with fields
 *
 * POST /api/schema-management:import
 * Body: { spec: "yaml string" }
 */
export async function importSpec(ctx: Context, next: Next) {
  const body = (ctx.request.body || ctx.action.params.values || {}) as ImportSpecRequest;
  const { spec } = body;

  if (!spec) {
    ctx.throw(400, 'spec parameter is required (YAML string)');
  }

  const { schema, errors, rawProperties } = parseOpenAPISpec(spec);

  if (errors.length > 0) {
    ctx.body = {
      success: false,
      errors,
      fieldsCreated: [],
      fieldsSkipped: [],
      warnings: [],
    };
    return await next();
  }

  // Detect system fields and prepare warnings (they will be ignored)
  const detectedSystemFields = detectSystemFields(rawProperties);
  const systemFieldWarnings: string[] = [];
  if (detectedSystemFields.length > 0) {
    systemFieldWarnings.push(
      `System fields detected and will be ignored: ${detectedSystemFields.join(', ')}. These are auto-generated.`,
    );
  }

  // Filter out reserved fields (id, createdAt, etc.) - these are auto-managed
  schema.fields = schema.fields.filter((f) => !RESERVED_FIELD_NAMES.has(f.name));

  // Add preset fields (createdAt, updatedAt, etc.) unless inheriting
  if (!schema.inherits) {
    schema.fields = [...PRESET_FIELDS, ...schema.fields];
  }

  // Build title -> internal name map from existing collections
  // Include both title and internal name as keys for lookup
  const titleToName = new Map<string, string>();
  const existingCollections = await ctx.db.getRepository('collections').find({
    fields: ['name', 'title'],
  });
  for (const coll of existingCollections) {
    titleToName.set(coll.title || coll.name, coll.name);
    // Also map internal name to itself for system relations (e.g., "users" -> "users")
    titleToName.set(coll.name, coll.name);
  }

  // Fail if collection already exists
  const existingName = titleToName.get(schema.title);
  if (existingName) {
    ctx.body = {
      success: false,
      errors: [`Collection "${schema.title}" already exists`],
      fieldsCreated: [],
      fieldsSkipped: [],
      warnings: [],
    };
    return await next();
  }

  // Validate all dependencies exist before creating anything
  const validationErrors = validateDependencies(schema, titleToName);
  if (validationErrors.length > 0) {
    ctx.body = {
      success: false,
      errors: validationErrors,
      fieldsCreated: [],
      fieldsSkipped: [],
      warnings: [],
    };
    return await next();
  }

  // Execute import within a transaction
  const result = await executeImport(ctx, schema, titleToName);

  // Add system field warnings to the result
  result.warnings = [...systemFieldWarnings, ...result.warnings];

  ctx.body = result;
  await next();
}

/**
 * Execute the import within a transaction for atomicity
 */
async function executeImport(
  ctx: Context,
  schema: CollectionSchema,
  titleToName: Map<string, string>,
): Promise<ImportResult> {
  const result: ImportResult = {
    success: false,
    fieldsCreated: [],
    fieldsSkipped: [],
    errors: [],
    warnings: [],
  };

  const transaction = await ctx.db.sequelize.transaction();

  try {
    // Create the collection
    const collectionPayload: Record<string, unknown> = {
      title: schema.title,
    };

    // Use explicit x-title-field if provided
    if (schema.titleField) {
      collectionPayload.titleField = schema.titleField;
    }

    // Handle inheritance
    if (schema.inherits && schema.inherits.length > 0) {
      const parentNames = schema.inherits.map((parentTitle) => titleToName.get(parentTitle)!);
      collectionPayload.inherits = parentNames;
    } else {
      collectionPayload.autoGenId = true;
    }

    const created = await ctx.db.getRepository('collections').create({
      values: collectionPayload,
      context: ctx,
      transaction,
    });

    result.collection = {
      name: created.name,
      title: schema.title,
    };

    titleToName.set(schema.title, created.name);
    const collectionName = created.name;

    // Create non-relation fields first
    for (const field of schema.fields) {
      if (isRelationField(field)) continue;

      try {
        const fieldModel = await ctx.db.getRepository('fields').create({
          values: {
            collectionName,
            ...field,
          },
          context: ctx,
          transaction,
        });
        // Load the field to bind it to the collection's Sequelize model
        await fieldModel.load({ transaction });
        result.fieldsCreated.push(field.name);
      } catch (e: any) {
        result.warnings.push(`Field '${field.name}': ${e.message}`);
        result.fieldsSkipped.push(field.name);
      }
    }

    // Create relation fields
    for (const field of schema.fields) {
      if (!isRelationField(field)) continue;

      const targetName = titleToName.get(field.target!);
      try {
        const fieldModel = await ctx.db.getRepository('fields').create({
          values: {
            collectionName,
            ...field,
            target: targetName,
          },
          context: ctx,
          transaction,
        });
        // Load the field to bind it to the collection's Sequelize model
        await fieldModel.load({ transaction });
        result.fieldsCreated.push(field.name);
      } catch (e: any) {
        result.warnings.push(`Field '${field.name}': ${e.message}`);
        result.fieldsSkipped.push(field.name);
      }
    }

    // Sync the collection to apply schema changes (allowNull, unique, etc.) to PostgreSQL
    const collection = ctx.db.getCollection(collectionName);
    await collection.sync({
      transaction,
      force: false,
      alter: {
        drop: false,
      },
    } as any);

    await transaction.commit();
    result.success = true;
  } catch (e: any) {
    await transaction.rollback();
    result.errors.push(`Import failed: ${e.message}`);
  }

  return result;
}

/**
 * Validate that all dependencies (parent collections, relation targets) exist
 */
function validateDependencies(schema: CollectionSchema, titleToName: Map<string, string>): string[] {
  const errors: string[] = [];

  // Check parent collections for inheritance
  if (schema.inherits && schema.inherits.length > 0) {
    const missingParents = schema.inherits.filter((parent) => !titleToName.has(parent));
    if (missingParents.length > 0) {
      errors.push(
        `Missing parent collection(s): ${missingParents.map((p) => `"${p}"`).join(', ')}. Import the parent collection(s) first.`,
      );
    }
  }

  // Check relation targets
  const relationFields = schema.fields.filter((f) => isRelationField(f) && f.target);
  const missingTargets = relationFields
    .filter((f) => !titleToName.has(f.target!))
    .map((f) => ({ field: f.name, target: f.target! }));

  if (missingTargets.length > 0) {
    const targetList = missingTargets.map((t) => `"${t.target}" (field: ${t.field})`).join(', ');
    errors.push(`Missing relation target collection(s): ${targetList}. Import the target collection(s) first.`);
  }

  return errors;
}

function isRelationField(field: FieldSchema): boolean {
  return ['belongsTo', 'belongsToMany', 'hasMany', 'hasOne'].includes(field.type);
}
