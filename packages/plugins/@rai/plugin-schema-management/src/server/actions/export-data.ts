import { Context, Next } from '@nocobase/actions';

interface ExportRequest {
  collection: string;
  fields?: string[];
}

const BATCH_SIZE = 1000;

/**
 * Detect belongsToMany fields on a collection and return their through-table info.
 */
function getBelongsToManyFields(collection: any): Array<{
  fieldName: string;
  through: string;
  foreignKey: string;
  otherKey: string;
}> {
  const results: Array<{ fieldName: string; through: string; foreignKey: string; otherKey: string }> = [];
  const fields = collection.getFields();
  for (const field of fields) {
    if (field.type === 'belongsToMany') {
      const opts = field.options || {};
      const through = typeof opts.through === 'string' ? opts.through : opts.through?.name;
      if (through && opts.foreignKey && opts.otherKey) {
        results.push({
          fieldName: field.name,
          through,
          foreignKey: opts.foreignKey,
          otherKey: opts.otherKey,
        });
      }
    }
  }
  return results;
}

/**
 * Stream main table records and junction table rows for belongsToMany fields.
 *
 * JSONL format:
 *   - Main records: plain JSON objects (one per line)
 *   - Junction sections: a marker line followed by junction rows
 *     Marker: {"__junction__":"t_xxx","field":"left_realsense_cameras","foreignKey":"f_a","otherKey":"f_b"}
 *     Rows: plain junction table rows (one per line)
 */
async function streamCollectionData(
  stream: NodeJS.WritableStream,
  db: any,
  collection: any,
  resolvedName: string,
  fieldsToExport: string[] | undefined,
) {
  const repository = db.getRepository(resolvedName);

  // Stream main records
  let offset = 0;
  let hasMore = true;

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

    for (const record of records) {
      stream.write(JSON.stringify(record) + '\n');
    }

    offset += records.length;

    if (records.length < BATCH_SIZE) {
      hasMore = false;
    }
  }

  // Export junction table rows for belongsToMany fields
  const m2mFields = getBelongsToManyFields(collection);

  for (const m2m of m2mFields) {
    // Check that the through table exists as a registered collection
    if (!db.hasCollection(m2m.through)) {
      continue;
    }

    const throughRepo = db.getRepository(m2m.through);

    // Write marker line
    stream.write(
      JSON.stringify({
        __junction__: m2m.through,
        field: m2m.fieldName,
        foreignKey: m2m.foreignKey,
        otherKey: m2m.otherKey,
      }) + '\n',
    );

    // Stream junction rows in batches
    let jOffset = 0;
    let jHasMore = true;

    while (jHasMore) {
      const rows = await throughRepo.find({
        limit: BATCH_SIZE,
        offset: jOffset,
        raw: true,
      });

      if (rows.length === 0) {
        jHasMore = false;
        break;
      }

      for (const row of rows) {
        stream.write(JSON.stringify(row) + '\n');
      }

      jOffset += rows.length;

      if (rows.length < BATCH_SIZE) {
        jHasMore = false;
      }
    }
  }
}

/**
 * Resolve a collection by name or title. Returns { collection, resolvedName, collectionTitle }
 * or throws 404 if not found.
 */
async function resolveCollection(
  ctx: Context,
  collectionName: string,
): Promise<{ collection: any; resolvedName: string; collectionTitle: string }> {
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

  return { collection, resolvedName, collectionTitle };
}

/**
 * Export action - stream collection data as JSON Lines
 *
 * POST /api/schema-management:export
 * Body: { collection: string, fields?: string[] }
 *
 * Returns: application/x-ndjson stream (one JSON object per line)
 *
 * belongsToMany junction table rows are appended after main records,
 * each section prefixed by a __junction__ marker line.
 */
export async function exportData(ctx: Context, next: Next) {
  const body = (ctx.request.body || ctx.action.params.values || {}) as ExportRequest;
  const { collection: collectionName, fields: requestedFields } = body;

  if (!collectionName) {
    ctx.throw(400, 'collection parameter is required');
  }

  const { collection, resolvedName, collectionTitle } = await resolveCollection(ctx, collectionName);

  // Determine which fields to export
  let fieldsToExport: string[] | undefined;
  if (requestedFields && requestedFields.length > 0) {
    const existingFields = collection.getFields();
    const existingFieldNames = new Set(existingFields.map((f: any) => f.name));

    const invalidFields = requestedFields.filter((f: string) => !existingFieldNames.has(f));
    if (invalidFields.length > 0) {
      ctx.throw(400, `Unknown field(s): ${invalidFields.join(', ')}`);
    }

    fieldsToExport = requestedFields;
  }

  // Set response headers for JSON Lines streaming
  ctx.set('Content-Type', 'application/x-ndjson');
  ctx.set('Content-Disposition', `attachment; filename="${collectionTitle}-export.jsonl"`);
  ctx.withoutDataWrapping = true;

  const { PassThrough } = await import('stream');
  const stream = new PassThrough();
  ctx.body = stream;

  const streamData = async () => {
    try {
      await streamCollectionData(stream, ctx.db, collection, resolvedName, fieldsToExport);
      stream.end();
    } catch (error: any) {
      stream.write(JSON.stringify({ _error: error.message }) + '\n');
      stream.end();
    }
  };

  streamData();

  await next();
}

/**
 * Export action (GET version for simpler usage)
 *
 * GET /api/schema-management:exportGet?collection=MyCollection
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

  const { collection, resolvedName, collectionTitle } = await resolveCollection(ctx, collectionName);

  // Validate requested fields
  if (requestedFields && requestedFields.length > 0) {
    const existingFields = collection.getFields();
    const existingFieldNames = new Set(existingFields.map((f: any) => f.name));

    const invalidFields = requestedFields.filter((f: string) => !existingFieldNames.has(f));
    if (invalidFields.length > 0) {
      ctx.throw(400, `Unknown field(s): ${invalidFields.join(', ')}`);
    }
  }

  // Set response headers
  ctx.set('Content-Type', 'application/x-ndjson');
  ctx.set('Content-Disposition', `attachment; filename="${collectionTitle}-export.jsonl"`);
  ctx.withoutDataWrapping = true;

  const { PassThrough } = await import('stream');
  const stream = new PassThrough();
  ctx.body = stream;

  const streamData = async () => {
    try {
      await streamCollectionData(stream, ctx.db, collection, resolvedName, requestedFields);
      stream.end();
    } catch (error: any) {
      stream.write(JSON.stringify({ _error: error.message }) + '\n');
      stream.end();
    }
  };

  streamData();

  await next();
}
