import { Context, Next } from '@nocobase/actions';

interface ExportRequest {
  collection: string;
  fields?: string[];
}

const BATCH_SIZE = 1000;

/**
 * Export action - stream collection data as JSON Lines
 *
 * POST /api/schema-management:export
 * Body: { collection: string, fields?: string[] }
 *
 * Returns: application/x-ndjson stream (one JSON object per line)
 *
 * This is useful for backing up data before applying breaking schema changes.
 */
export async function exportData(ctx: Context, next: Next) {
  const body = (ctx.request.body || ctx.action.params.values || {}) as ExportRequest;
  const { collection: collectionName, fields: requestedFields } = body;

  if (!collectionName) {
    ctx.throw(400, 'collection parameter is required');
  }

  // Resolve collection name (could be title)
  let collection = ctx.db.getCollection(collectionName);
  let resolvedName = collectionName;
  let collectionTitle = collectionName;

  if (!collection) {
    const collMeta = await ctx.db.getRepository('collections').findOne({
      filter: { title: collectionName },
    });
    if (collMeta) {
      collection = ctx.db.getCollection(collMeta.name);
      resolvedName = collMeta.name;
      collectionTitle = collMeta.title;
    }
  } else {
    const collMeta = await ctx.db.getRepository('collections').findOne({
      filter: { name: collection.name },
    });
    if (collMeta?.title) {
      collectionTitle = collMeta.title;
    }
  }

  if (!collection) {
    ctx.throw(404, `Collection '${collectionName}' not found`);
  }

  const repository = ctx.db.getRepository(resolvedName);

  // Determine which fields to export
  let fieldsToExport: string[] | undefined;
  if (requestedFields && requestedFields.length > 0) {
    // Validate that requested fields exist
    const existingFields = collection.getFields();
    const existingFieldNames = new Set(existingFields.map((f) => f.name));

    const invalidFields = requestedFields.filter((f) => !existingFieldNames.has(f));
    if (invalidFields.length > 0) {
      ctx.throw(400, `Unknown field(s): ${invalidFields.join(', ')}`);
    }

    fieldsToExport = requestedFields;
  }

  // Set response headers for JSON Lines streaming
  ctx.set('Content-Type', 'application/x-ndjson');
  ctx.set('Content-Disposition', `attachment; filename="${collectionTitle}-export.jsonl"`);
  ctx.withoutDataWrapping = true;

  // Create a PassThrough stream for response
  const { PassThrough } = await import('stream');
  const stream = new PassThrough();
  ctx.body = stream;

  // Stream data in batches to avoid memory issues
  let offset = 0;
  let hasMore = true;

  const streamData = async () => {
    try {
      while (hasMore) {
        const findOptions: any = {
          limit: BATCH_SIZE,
          offset,
          raw: true,
        };

        if (fieldsToExport) {
          findOptions.fields = fieldsToExport;
        }

        const records = await repository.find(findOptions);

        if (records.length === 0) {
          hasMore = false;
          break;
        }

        // Write each record as a JSON line
        for (const record of records) {
          const jsonLine = JSON.stringify(record) + '\n';
          stream.write(jsonLine);
        }

        offset += records.length;

        if (records.length < BATCH_SIZE) {
          hasMore = false;
        }
      }

      stream.end();
    } catch (error: any) {
      // Write error as a special JSON line and close stream
      const errorLine = JSON.stringify({ _error: error.message }) + '\n';
      stream.write(errorLine);
      stream.end();
    }
  };

  // Start streaming (don't await - let it run async)
  streamData();

  await next();
}

/**
 * Export action (GET version for simpler usage)
 *
 * GET /api/schema-management:export?collection=MyCollection
 */
export async function exportDataGet(ctx: Context, next: Next) {
  const { collection: collectionName, fields } = ctx.action.params as { collection: string; fields?: string | string[] };

  if (!collectionName) {
    ctx.throw(400, 'collection parameter is required');
  }

  // Convert fields from comma-separated string if needed
  let requestedFields: string[] | undefined;
  if (fields) {
    requestedFields = typeof fields === 'string' ? fields.split(',').map((f: string) => f.trim()) : fields;
  }

  // Resolve collection name
  let collection = ctx.db.getCollection(collectionName);
  let resolvedName = collectionName;
  let collectionTitle = collectionName;

  if (!collection) {
    const collMeta = await ctx.db.getRepository('collections').findOne({
      filter: { title: collectionName },
    });
    if (collMeta) {
      collection = ctx.db.getCollection(collMeta.name);
      resolvedName = collMeta.name;
      collectionTitle = collMeta.title;
    }
  } else {
    const collMeta = await ctx.db.getRepository('collections').findOne({
      filter: { name: collection.name },
    });
    if (collMeta?.title) {
      collectionTitle = collMeta.title;
    }
  }

  if (!collection) {
    ctx.throw(404, `Collection '${collectionName}' not found`);
  }

  const repository = ctx.db.getRepository(resolvedName);

  // Validate requested fields
  if (requestedFields && requestedFields.length > 0) {
    const existingFields = collection.getFields();
    const existingFieldNames = new Set(existingFields.map((f) => f.name));

    const invalidFields = requestedFields.filter((f) => !existingFieldNames.has(f));
    if (invalidFields.length > 0) {
      ctx.throw(400, `Unknown field(s): ${invalidFields.join(', ')}`);
    }
  }

  // Set response headers
  ctx.set('Content-Type', 'application/x-ndjson');
  ctx.set('Content-Disposition', `attachment; filename="${collectionTitle}-export.jsonl"`);
  ctx.withoutDataWrapping = true;

  // Create stream
  const { PassThrough } = await import('stream');
  const stream = new PassThrough();
  ctx.body = stream;

  // Stream data
  let offset = 0;
  let hasMore = true;

  const streamData = async () => {
    try {
      while (hasMore) {
        const findOptions: any = {
          limit: BATCH_SIZE,
          offset,
          raw: true,
        };

        if (requestedFields) {
          findOptions.fields = requestedFields;
        }

        const records = await repository.find(findOptions);

        if (records.length === 0) {
          hasMore = false;
          break;
        }

        for (const record of records) {
          const jsonLine = JSON.stringify(record) + '\n';
          stream.write(jsonLine);
        }

        offset += records.length;

        if (records.length < BATCH_SIZE) {
          hasMore = false;
        }
      }

      stream.end();
    } catch (error: any) {
      const errorLine = JSON.stringify({ _error: error.message }) + '\n';
      stream.write(errorLine);
      stream.end();
    }
  };

  streamData();

  await next();
}
