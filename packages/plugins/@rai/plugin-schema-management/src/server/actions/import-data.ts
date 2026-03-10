import { Context, Next } from '@nocobase/actions';
import { resolveCollection } from '../utils';

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
  junctionRowsInserted: number;
  errors: string[];
  warnings: string[];
}

interface JunctionMarker {
  __junction__: string;
  field: string;
  foreignKey: string;
  otherKey: string;
}

interface ParsedData {
  mainRecords: Record<string, unknown>[];
  junctionSections: Array<{ marker: JunctionMarker; rows: Record<string, unknown>[] }>;
  parseErrors: string[];
}

const BATCH_SIZE = 100;

/**
 * Parse JSONL data into main records and junction sections.
 *
 * Main records are plain JSON objects.
 * Junction sections start with a __junction__ marker line, followed by junction rows.
 * All subsequent non-marker lines after a marker are treated as junction rows
 * until the next marker or end of data.
 */
function parseJsonLines(data: string): ParsedData {
  const lines = data.split('\n').filter((line) => line.trim());
  const mainRecords: Record<string, unknown>[] = [];
  const junctionSections: Array<{ marker: JunctionMarker; rows: Record<string, unknown>[] }> = [];
  const parseErrors: string[] = [];

  let currentJunction: { marker: JunctionMarker; rows: Record<string, unknown>[] } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    try {
      const record = JSON.parse(line);
      if (typeof record !== 'object' || record === null || Array.isArray(record)) {
        parseErrors.push(`Line ${i + 1}: Expected a JSON object`);
        continue;
      }

      // Check if this is a junction marker
      if (record.__junction__) {
        currentJunction = {
          marker: record as JunctionMarker,
          rows: [],
        };
        junctionSections.push(currentJunction);
        continue;
      }

      // Strip internal metadata fields
      for (const key of Object.keys(record)) {
        if (key.startsWith('__')) delete record[key];
      }

      if (currentJunction) {
        // We're inside a junction section — this row belongs to the through table
        currentJunction.rows.push(record);
      } else {
        // Main record
        mainRecords.push(record);
      }
    } catch (err: any) {
      parseErrors.push(`Line ${i + 1}: Invalid JSON - ${err.message}`);
    }
  }

  return { mainRecords, junctionSections, parseErrors };
}

/**
 * Import action - import JSON Lines data into a collection
 *
 * POST /api/schema-management:importData
 * Body: { collection: string, data: string, mode?: 'insert' | 'upsert' }
 *
 * Returns: ImportResult
 *
 * Supports belongsToMany junction table rows appended after main records.
 * Junction sections are identified by __junction__ marker lines in the JSONL.
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

  // Resolve collection (case-insensitive title matching, 409 on ambiguity)
  const { resolvedName } = await resolveCollection(ctx, collectionName);
  const collection = ctx.db.getCollection(resolvedName)!;

  const repository = ctx.db.getRepository(resolvedName);

  // Parse JSONL into main records and junction sections
  const { mainRecords, junctionSections, parseErrors } = parseJsonLines(data);

  if (parseErrors.length > 0 && mainRecords.length === 0) {
    ctx.body = {
      success: false,
      recordsInserted: 0,
      recordsUpdated: 0,
      recordsSkipped: parseErrors.length,
      junctionRowsInserted: 0,
      errors: parseErrors.slice(0, 10),
      warnings: parseErrors.length > 10 ? [`... and ${parseErrors.length - 10} more parse errors`] : [],
    } satisfies ImportResult;
    ctx.withoutDataWrapping = true;
    await next();
    return;
  }

  const result: ImportResult = {
    success: true,
    recordsInserted: 0,
    recordsUpdated: 0,
    recordsSkipped: parseErrors.length,
    junctionRowsInserted: 0,
    errors: parseErrors.slice(0, 5),
    warnings: [],
  };

  // Get primary key field (default to 'id')
  const primaryKeyField = collection.model.primaryKeyAttribute || 'id';

  // Import main records
  for (let i = 0; i < mainRecords.length; i += BATCH_SIZE) {
    const batch = mainRecords.slice(i, i + BATCH_SIZE);

    for (const record of batch) {
      try {
        if (mode === 'upsert') {
          const pkValue = record[primaryKeyField];

          if (pkValue !== undefined && pkValue !== null) {
            const existing = await repository.findOne({
              filter: { [primaryKeyField]: pkValue },
            });

            if (existing) {
              await repository.update({
                filter: { [primaryKeyField]: pkValue },
                values: record,
              });
              result.recordsUpdated++;
            } else {
              await repository.create({
                values: record,
              });
              result.recordsInserted++;
            }
          } else {
            await repository.create({
              values: record,
            });
            result.recordsInserted++;
          }
        } else {
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

  // Import junction table rows
  for (const section of junctionSections) {
    const throughName = section.marker.__junction__;

    if (!ctx.db.hasCollection(throughName)) {
      const msg = `Junction table '${throughName}' for field '${section.marker.field}' not found, skipping ${section.rows.length} rows`;
      result.warnings.push(msg);
      continue;
    }

    const throughRepo = ctx.db.getRepository(throughName);

    for (const row of section.rows) {
      try {
        // Upsert: check if this exact FK pair already exists
        const fk = section.marker.foreignKey;
        const ok = section.marker.otherKey;
        const fkVal = row[fk];
        const okVal = row[ok];

        if (fkVal !== undefined && okVal !== undefined) {
          const existing = await throughRepo.findOne({
            filter: { [fk]: fkVal, [ok]: okVal },
          });

          if (!existing) {
            await throughRepo.create({ values: row });
            result.junctionRowsInserted++;
          }
          // If it already exists, skip silently (idempotent)
        } else {
          // Missing FK values — insert anyway, let DB constraints catch issues
          await throughRepo.create({ values: row });
          result.junctionRowsInserted++;
        }
      } catch (err: any) {
        const errorMsg = `Junction ${throughName}: ${err.message}`;
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
  if (result.recordsInserted === 0 && result.recordsUpdated === 0 && result.junctionRowsInserted === 0) {
    result.success = false;
  }

  ctx.body = result;
  ctx.withoutDataWrapping = true;
  await next();
}
