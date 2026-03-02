import { Context, Next } from '@nocobase/actions';
import * as yaml from 'js-yaml';
import {
  diffSchemas,
  canAutoApply,
  validateMigration,
  mapFieldToOpenAPI,
  normalizeFieldName,
  type ClassifiedChanges,
  type ValidationWarning,
  type FieldMapperContext,
} from '../utils';

// System fields that are auto-generated and should not be in the required array
const SYSTEM_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'createdBy',
  'updatedBy',
  'createdById',
  'updatedById',
]);

interface DiffRequest {
  collection: string;
  spec: string;
}

interface DiffResponse {
  currentSpec: string;
  changes: ClassifiedChanges;
  validationWarnings: ValidationWarning[];
  canAutoApply: boolean;
}

/**
 * Generate current OpenAPI spec for a collection
 * (Duplicated from generate.ts to avoid circular dependencies)
 */
async function generateCurrentSpec(ctx: Context, collectionName: string): Promise<string> {
  // Try direct lookup first (internal name)
  let collection = ctx.db.getCollection(collectionName);
  let collMeta;

  if (!collection) {
    // Try finding by title (human-readable name)
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

  // Get collection title from metadata if not already fetched
  if (!collMeta) {
    collMeta = await ctx.db.getRepository('collections').findOne({
      filter: { name: collection.name },
    });
  }
  const title = collMeta?.title || collectionName;

  // Build collection title map for resolving relation targets
  const allCollections = await ctx.db.getRepository('collections').find({
    fields: ['name', 'title'],
  });
  const collectionTitleMap = new Map<string, string>();
  for (const coll of allCollections) {
    collectionTitleMap.set(coll.name, coll.title || coll.name);
  }

  const mapperContext: FieldMapperContext = { collectionTitleMap };

  // Build OpenAPI schema from fields
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

  // Build schema object with optional x-inherits
  const schemaObject: Record<string, any> = {
    type: 'object',
    properties,
    ...(required.length > 0 && { required }),
  };

  // Handle inheritance
  const inherits = collection.options?.inherits;
  if (inherits) {
    const parents = Array.isArray(inherits) ? inherits : [inherits];
    const uniqueParents = [...new Set(parents)];
    schemaObject['x-inherits'] = uniqueParents.map((name: string) => collectionTitleMap.get(name) || name);
  }

  schemaObject['x-title-field'] = collection.options?.titleField || 'id';

  const spec = {
    openapi: '3.1.0',
    info: {
      title,
      version: '1.0.0',
    },
    components: {
      schemas: {
        [title]: schemaObject,
      },
    },
  };

  return yaml.dump(spec, { lineWidth: -1 });
}

/**
 * Diff action - compare current schema with proposed changes
 *
 * POST /api/schema-management:diff
 * Body: { collection: string, spec: string }
 *
 * Returns:
 * - currentSpec: The current OpenAPI spec for the collection
 * - changes: Classified changes (nonBreaking, breaking, unclassified)
 * - validationWarnings: Data issues for breaking changes
 * - canAutoApply: true if no breaking changes
 */
export async function diff(ctx: Context, next: Next) {
  const body = (ctx.request.body || ctx.action.params.values || {}) as DiffRequest;
  const { collection: collectionName, spec: newSpecYaml } = body;

  if (!collectionName) {
    ctx.throw(400, 'collection parameter is required');
  }

  if (!newSpecYaml) {
    ctx.throw(400, 'spec parameter is required (YAML string)');
  }

  // Resolve collection name (could be title)
  let collection = ctx.db.getCollection(collectionName);
  let resolvedName = collectionName;

  if (!collection) {
    const collMeta = await ctx.db.getRepository('collections').findOne({
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

  try {
    // Generate current spec
    const currentSpecYaml = await generateCurrentSpec(ctx, resolvedName);

    // Parse both specs to JSON for comparison
    const currentSpec = yaml.load(currentSpecYaml) as any;
    const newSpec = yaml.load(newSpecYaml) as any;

    // Use custom schema diff that properly detects x-* additions and required changes
    const changes = diffSchemas(currentSpec, newSpec);

    // Validate breaking changes against actual data
    const validationResult = await validateMigration(ctx, resolvedName, changes);

    const response: DiffResponse = {
      currentSpec: currentSpecYaml,
      changes,
      validationWarnings: validationResult.warnings,
      canAutoApply: canAutoApply(changes),
    };

    ctx.body = response;
  } catch (error: any) {
    ctx.throw(400, `Diff failed: ${error.message}`);
  }

  await next();
}
