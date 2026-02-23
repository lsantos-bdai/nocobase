import { Context, Next } from '@nocobase/actions';
import * as yaml from 'js-yaml';
import { mapFieldToOpenAPI, normalizeFieldName } from '../utils';

export async function generate(ctx: Context, next: Next) {
  const { collection: collectionName } = ctx.action.params;

  if (!collectionName) {
    ctx.throw(400, 'collection parameter is required');
  }

  const collection = ctx.db.getCollection(collectionName);
  if (!collection) {
    ctx.throw(404, `Collection '${collectionName}' not found`);
  }

  // Get collection title from metadata
  const collMeta = await ctx.db.getRepository('collections').findOne({
    filter: { name: collectionName },
  });
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
  await next();
}
