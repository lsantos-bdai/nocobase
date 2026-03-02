import { Context, Next } from '@nocobase/actions';
import * as yaml from 'js-yaml';
import { mapFieldToOpenAPI, normalizeFieldName, FieldMapperContext } from '../utils';

export async function generate(ctx: Context, next: Next) {
  const { collection: collectionName } = ctx.action.params;

  if (!collectionName) {
    ctx.throw(400, 'collection parameter is required');
  }

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
    ctx.throw(404, `Collection '${collectionName}' not found`);
  }

  // Get collection title from metadata if not already fetched
  if (!collMeta) {
    collMeta = await ctx.db.getRepository('collections').findOne({
      filter: { name: collection.name },
    });
  }
  const title = collMeta?.title || collectionName;

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

      // Add to required if primary key or not nullable
      if (field.options?.primaryKey || field.options?.allowNull === false) {
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
    schemaObject['x-inherits'] = parents.map((name: string) => collectionTitleMap.get(name) || name);
  }

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
