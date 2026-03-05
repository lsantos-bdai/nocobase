import { Context, Next } from '@nocobase/actions';

interface ImportRequest {
  collection: string;
  data: string;
  mode?: 'insert' | 'upsert';
}

interface ImportResult {
  success: boolean;
  recordsInserted: number;
  recordsUpdated: number;
  recordsSkipped: number;
  errors: string[];
  warnings: string[];
}

const BATCH_SIZE = 100;

/**
 * Import action - import JSON Lines data into a collection
 *
 * POST /api/schema-management:importData
 * Body: { collection: string, data: string, mode?: 'insert' | 'upsert' }
 *
 * Returns: ImportResult
 */
export async function importData(ctx: Context, next: Next) {
  const body = (ctx.request.body || ctx.action.params.values || {}) as ImportRequest;
  const { collection: collectionName, data, mode = 'insert' } = body;

  if (!collectionName) {
    ctx.throw(400, 'collection parameter is required');
  }

  if (!data || typeof data !== 'string') {
    ctx.throw(400, 'data parameter is required and must be a string');
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

  const repository = ctx.db.getRepository(resolvedName);

  // Parse JSON Lines
  const lines = data.split('\n').filter((line) => line.trim());
  const records: Record<string, unknown>[] = [];
  const parseErrors: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    try {
      const record = JSON.parse(line);
      if (typeof record !== 'object' || record === null || Array.isArray(record)) {
        parseErrors.push(`Line ${i + 1}: Expected a JSON object`);
        continue;
      }
      // Strip internal metadata fields injected by raw Sequelize queries (e.g. __tableName, __collection)
      for (const key of Object.keys(record)) {
        if (key.startsWith('__')) delete record[key];
      }
      records.push(record);
    } catch (err: any) {
      parseErrors.push(`Line ${i + 1}: Invalid JSON - ${err.message}`);
    }
  }

  if (parseErrors.length > 0 && records.length === 0) {
    ctx.body = {
      success: false,
      recordsInserted: 0,
      recordsUpdated: 0,
      recordsSkipped: parseErrors.length,
      errors: parseErrors.slice(0, 10), // Limit error output
      warnings: parseErrors.length > 10 ? [`... and ${parseErrors.length - 10} more parse errors`] : [],
    } satisfies ImportResult;
    await next();
    return;
  }

  // Process records in batches
  const result: ImportResult = {
    success: true,
    recordsInserted: 0,
    recordsUpdated: 0,
    recordsSkipped: parseErrors.length,
    errors: parseErrors.slice(0, 5),
    warnings: [],
  };

  // Get primary key field (default to 'id')
  const primaryKeyField = collection.model.primaryKeyAttribute || 'id';

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);

    for (const record of batch) {
      try {
        if (mode === 'upsert') {
          const pkValue = record[primaryKeyField];

          if (pkValue !== undefined && pkValue !== null) {
            // Check if record exists
            const existing = await repository.findOne({
              filter: { [primaryKeyField]: pkValue },
            });

            if (existing) {
              // Update existing record
              await repository.update({
                filter: { [primaryKeyField]: pkValue },
                values: record,
              });
              result.recordsUpdated++;
            } else {
              // Insert new record
              await repository.create({
                values: record,
              });
              result.recordsInserted++;
            }
          } else {
            // No primary key - insert as new
            await repository.create({
              values: record,
            });
            result.recordsInserted++;
          }
        } else {
          // Insert mode - just create
          await repository.create({
            values: record,
          });
          result.recordsInserted++;
        }
      } catch (err: any) {
        result.recordsSkipped++;
        const errorMsg = `Record ${i + batch.indexOf(record) + 1}: ${err.message}`;
        if (result.errors.length < 10) {
          result.errors.push(errorMsg);
        }
      }
    }
  }

  // Add warning if errors were truncated
  if (result.errors.length >= 10) {
    result.warnings.push(`Some errors were truncated. Total skipped: ${result.recordsSkipped}`);
  }

  // Mark as failed if no records were imported
  if (result.recordsInserted === 0 && result.recordsUpdated === 0) {
    result.success = false;
  }

  ctx.body = result;
  await next();
}
