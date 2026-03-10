import { Context, Next } from '@nocobase/actions';
import * as yaml from 'js-yaml';
import { mapFieldToOpenAPI, normalizeFieldName, FieldMapperContext, resolveCollection } from '../utils';

// System fields that are auto-generated and should not be in the required array
const SYSTEM_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'createdBy',
  'updatedBy',
  'createdById',
  'updatedById',
]);

export async function generate(ctx: Context, next: Next) {
  const { collection: collectionName } = ctx.action.params;

  if (!collectionName) {
    ctx.throw(400, 'collection parameter is required');
  }

  // Resolve collection (case-insensitive title matching, 409 on ambiguity)
  const { resolvedName, collectionTitle: title } = await resolveCollection(ctx, collectionName);
  const collection = ctx.db.getCollection(resolvedName)!;

  // Build collection title map for resolving relation targets to human-readable names
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
      // Get title from uiSchema or options
      const fieldTitle = field.options?.uiSchema?.title || field.options?.title;
      const fieldName = normalizeFieldName(field.name, fieldTitle);
      properties[fieldName] = fieldSchema;

      // Add to required if primary key or not nullable (exclude auto-generated system fields)
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

  // Handle inheritance (dedupe due to deepmerge concatenation in NocoBase core)
  const inherits = collection.options?.inherits;
  if (inherits) {
    const parents = Array.isArray(inherits) ? inherits : [inherits];
    const uniqueParents = [...new Set(parents)];
    schemaObject['x-inherits'] = uniqueParents.map((name: string) => collectionTitleMap.get(name) || name);
  }

  // Always export titleField (defaults to 'id')
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

  ctx.body = yaml.dump(spec, { lineWidth: -1 });
  ctx.type = 'text/yaml';
  ctx.withoutDataWrapping = true;
  await next();
}
