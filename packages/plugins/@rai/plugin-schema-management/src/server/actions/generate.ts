import { Context, Next } from '@nocobase/actions';
import * as yaml from 'js-yaml';
import { mapFieldToOpenAPI, normalizeFieldName } from '../utils';

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

  // Build OpenAPI schema from fields
  const fields = collection.getFields();
  const properties: Record<string, any> = {};
  const required: string[] = [];

  for (const field of fields) {
    const fieldSchema = mapFieldToOpenAPI(field);
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

  const spec = {
    openapi: '3.0.3',
    info: {
      title,
      version: '1.0.0',
    },
    components: {
      schemas: {
        [title]: {
          type: 'object',
          properties,
          ...(required.length > 0 && { required }),
        },
      },
    },
  };

  ctx.body = yaml.dump(spec, { lineWidth: -1 });
  ctx.type = 'text/yaml';
  ctx.withoutDataWrapping = true;
  await next();
}
