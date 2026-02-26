import { Database, Model } from '@nocobase/database';
import { extractAuthInfo } from './auth-helpers';
import type { HookOptions, HookValidationResult, CdcContext, CreateSnapshotParams, Logger } from '../hooks/types';

// Collections that should never be audited
export const EXCLUDED_COLLECTIONS = new Set([
  'cdc_snapshots',
  'cdc_config',
  'auditLogs',
  'auditChanges',
  'sessions',
  'authenticators',
  'verifications',
  'systemSettings',
  'applicationVersion',
]);

// Prefixes that indicate system collections
export const EXCLUDED_PREFIXES = ['_', 'ui', 'auth'];

// System-managed fields that should not trigger snapshots
export const SYSTEM_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'deletedAt',
  'createdById',
  'updatedById',
]);

// Array version for consumers that need iteration
export const SYSTEM_FIELDS_ARRAY = ['createdAt', 'updatedAt', 'deletedAt', 'createdById', 'updatedById'];

/**
 * Extract a human-readable name from record data.
 * Tries common name fields in order of preference.
 */
export function getRecordName(data: Record<string, unknown> | null): string {
  if (!data) return 'Unknown';
  return String(
    data.name || data.title || data.label || data.nickname || data.id || 'Unknown',
  );
}

/**
 * Extract ID(s) from a value for comparison purposes.
 * For associations, we only care about which record is linked, not the record's data.
 * Returns a normalized string representation for comparison.
 */
function getIdFromValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === 'object' && v && 'id' in v ? String((v as { id: unknown }).id) : String(v)))
      .sort()
      .join(',');
  }

  if (typeof value === 'object' && value && 'id' in value) {
    return String((value as { id: unknown }).id);
  }

  return String(value);
}

export function shouldAuditCollection(collectionName: string): boolean {
  if (EXCLUDED_COLLECTIONS.has(collectionName)) {
    return false;
  }

  for (const prefix of EXCLUDED_PREFIXES) {
    if (collectionName.startsWith(prefix)) {
      return false;
    }
  }

  return true;
}

/**
 * Get all association field names for a collection (for use with appends)
 */
export function getAssociationFieldNames(db: Database, collectionName: string): string[] {
  const collection = db.getCollection(collectionName);
  if (!collection) {
    return [];
  }

  const associations: string[] = [];
  try {
    for (const [name, field] of collection.fields) {
      if (['belongsTo', 'hasOne', 'hasMany', 'belongsToMany'].includes(field.type)) {
        associations.push(name);
      }
    }
  } catch {
    return [];
  }
  return associations;
}

export async function isCollectionEnabled(
  db: Database,
  collectionName: string,
): Promise<boolean> {
  if (!shouldAuditCollection(collectionName)) {
    return false;
  }

  try {
    const configRepo = db.getRepository('cdc_config');
    const config = await configRepo.findOne({
      filter: { collectionName },
    });

    // If no config exists, collection is not being tracked
    if (!config) {
      return false;
    }

    return config.get('enabled') === true;
  } catch {
    // If table doesn't exist yet (during installation), return false
    return false;
  }
}

export function getChangedFields(
  beforeData: Record<string, unknown> | null,
  afterData: Record<string, unknown> | null,
): string[] {
  if (!beforeData || !afterData) {
    return [];
  }

  const changedFields: string[] = [];
  const allKeys = new Set([...Object.keys(beforeData), ...Object.keys(afterData)]);

  for (const key of allKeys) {
    // Skip internal fields
    if (key.startsWith('_')) continue;

    // Skip system-managed fields (createdAt, updatedAt, etc.)
    if (SYSTEM_FIELDS.has(key)) continue;

    const before = beforeData[key];
    const after = afterData[key];

    // Normalize null/undefined
    const beforeNorm = before === undefined ? null : before;
    const afterNorm = after === undefined ? null : after;

    // Simple equality check handles primitives and both-null
    if (beforeNorm === afterNorm) continue;

    // One is null, the other is not
    if (beforeNorm === null || afterNorm === null) {
      changedFields.push(key);
      continue;
    }

    // For relations and complex values: compare by ID
    const beforeId = getIdFromValue(beforeNorm);
    const afterId = getIdFromValue(afterNorm);

    if (beforeId !== afterId) {
      changedFields.push(key);
    }
  }

  return changedFields;
}

export async function getNextVersion(
  db: Database,
  collectionName: string,
  recordId: string,
  transaction?: any,
): Promise<number> {
  const snapshotRepo = db.getRepository('cdc_snapshots');

  const lastSnapshot = await snapshotRepo.findOne({
    filter: {
      collectionName,
      recordId,
    },
    sort: ['-version'],
    transaction,
  });

  if (!lastSnapshot) {
    return 1;
  }

  return (lastSnapshot.get('version') as number) + 1;
}

export function getPrimaryKeyValue(model: Model): string {
  // Use Sequelize's primaryKeyAttribute for reliable primary key access
  const ModelClass = model.constructor as typeof Model;
  const pk = (ModelClass as any).primaryKeyAttribute || 'id';
  return String(model.get(pk) ?? '');
}

export function getPlainData(model: Model): Record<string, unknown> {
  if (typeof model.get === 'function') {
    return model.get({ plain: true });
  }
  return model.toJSON ? model.toJSON() : { ...model };
}

/**
 * Get collection config (retentionDays, maxVersions)
 */
export async function getCollectionConfig(
  db: Database,
  collectionName: string,
): Promise<{ retentionDays: number | null; maxVersions: number | null } | null> {
  try {
    const configRepo = db.getRepository('cdc_config');
    const config = await configRepo.findOne({
      filter: { collectionName },
    });

    if (!config) {
      return null;
    }

    return {
      retentionDays: config.get('retentionDays') as number | null,
      maxVersions: config.get('maxVersions') as number | null,
    };
  } catch {
    return null;
  }
}

/**
 * Cleanup old snapshots based on collection config.
 * Called after creating a new snapshot.
 */
export async function cleanupSnapshots(
  db: Database,
  collectionName: string,
  recordId: string,
): Promise<void> {
  const config = await getCollectionConfig(db, collectionName);
  if (!config) {
    return;
  }

  const snapshotRepo = db.getRepository('cdc_snapshots');

  // Cleanup by maxVersions - keep only the N most recent versions for this record
  if (config.maxVersions !== null && config.maxVersions > 0) {
    const snapshots = await snapshotRepo.find({
      filter: { collectionName, recordId },
      sort: ['-version'],
      fields: ['id', 'version'],
    });

    if (snapshots.length > config.maxVersions) {
      const toDelete = snapshots.slice(config.maxVersions);
      const idsToDelete = toDelete.map((s) => s.get('id'));

      if (idsToDelete.length > 0) {
        await snapshotRepo.destroy({
          filter: { id: { $in: idsToDelete } },
          hooks: false,
        });
      }
    }
  }

  // Cleanup by retentionDays - delete snapshots older than X days for this collection
  if (config.retentionDays !== null && config.retentionDays > 0) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - config.retentionDays);

    await snapshotRepo.destroy({
      filter: {
        collectionName,
        createdAt: { $lt: cutoffDate },
      },
      hooks: false,
    });
  }

  // Prune filter metadata after cleanup
  await pruneFilterMetadata(db, collectionName);
}

/**
 * Update filter metadata (capturedRecords and capturedFields) when a snapshot is created.
 * This maintains historical record of all IDs/names and fields that have appeared in snapshots.
 */
export async function updateFilterMetadata(
  db: Database,
  collectionName: string,
  recordId: string,
  recordName: string | null,
  changedFields: string[],
): Promise<void> {
  try {
    const configRepo = db.getRepository('cdc_config');
    const config = await configRepo.findOne({
      filter: { collectionName },
    });

    if (!config) {
      return;
    }

    const capturedRecords = (config.get('capturedRecords') as Array<{ id: string; name: string }>) || [];
    const capturedFields = (config.get('capturedFields') as string[]) || [];

    let recordsUpdated = false;
    let fieldsUpdated = false;

    // Add {id, name} pair if not already present (match on both id AND name)
    const displayName = recordName || recordId;
    const existingRecord = capturedRecords.find((r) => r.id === recordId && r.name === displayName);
    if (!existingRecord) {
      capturedRecords.push({ id: recordId, name: displayName });
      recordsUpdated = true;
    }

    // Add any new field names
    const fieldsSet = new Set(capturedFields);
    for (const field of changedFields) {
      if (!fieldsSet.has(field)) {
        fieldsSet.add(field);
        fieldsUpdated = true;
      }
    }

    // Only update if something changed
    if (recordsUpdated || fieldsUpdated) {
      const updates: Record<string, unknown> = {};
      if (recordsUpdated) {
        updates.capturedRecords = capturedRecords;
      }
      if (fieldsUpdated) {
        updates.capturedFields = Array.from(fieldsSet);
      }

      await configRepo.update({
        filterByTk: collectionName,
        values: updates,
      });
    }
  } catch {
    // Silently ignore errors to not disrupt snapshot creation
  }
}

/**
 * Prune filter metadata by removing entries for records/fields that no longer exist in snapshots.
 * Called after snapshot cleanup (retention/maxVersions).
 */
export async function pruneFilterMetadata(
  db: Database,
  collectionName: string,
): Promise<void> {
  try {
    const configRepo = db.getRepository('cdc_config');
    const snapshotRepo = db.getRepository('cdc_snapshots');

    const config = await configRepo.findOne({
      filter: { collectionName },
    });

    if (!config) {
      return;
    }

    const capturedRecords = (config.get('capturedRecords') as Array<{ id: string; name: string }>) || [];
    const capturedFields = (config.get('capturedFields') as string[]) || [];

    if (capturedRecords.length === 0 && capturedFields.length === 0) {
      return;
    }

    // Get distinct recordIds still in snapshots
    const remainingSnapshots = await snapshotRepo.find({
      filter: { collectionName },
      fields: ['recordId', 'changedFields'],
    });

    const remainingRecordIds = new Set<string>();
    const remainingFields = new Set<string>();

    for (const snapshot of remainingSnapshots) {
      remainingRecordIds.add(snapshot.get('recordId') as string);
      const fields = snapshot.get('changedFields') as string[];
      if (fields) {
        for (const field of fields) {
          remainingFields.add(field);
        }
      }
    }

    // Filter capturedRecords to only those with IDs still in snapshots
    const prunedRecords = capturedRecords.filter((r) => remainingRecordIds.has(r.id));
    const prunedFields = capturedFields.filter((f) => remainingFields.has(f));

    const recordsChanged = prunedRecords.length !== capturedRecords.length;
    const fieldsChanged = prunedFields.length !== capturedFields.length;

    if (recordsChanged || fieldsChanged) {
      const updates: Record<string, unknown> = {};
      if (recordsChanged) {
        updates.capturedRecords = prunedRecords;
      }
      if (fieldsChanged) {
        updates.capturedFields = prunedFields;
      }

      await configRepo.update({
        filterByTk: collectionName,
        values: updates,
      });
    }
  } catch {
    // Silently ignore errors to not disrupt cleanup
  }
}

// ============================================================================
// Hook Utilities - Shared validation and snapshot creation logic
// ============================================================================

/**
 * Validate hook context and return collection info if the hook should proceed.
 * Returns null if the hook should exit early.
 */
export async function validateHookContext(
  model: Model,
  options: HookOptions,
  db: Database,
): Promise<HookValidationResult | null> {
  const { collection } = model.constructor as any;

  if (!collection) {
    return null;
  }

  const collectionName = collection.name;

  // Skip if logging is disabled in options (e.g., during bulk imports)
  if (options.logging === false) {
    return null;
  }

  // Check our exclusion list (system collections, cdc_*, ui*, etc.)
  if (!shouldAuditCollection(collectionName)) {
    return null;
  }

  // Check cdc_config for per-collection disable
  const enabled = await isCollectionEnabled(db, collectionName);
  if (!enabled) {
    return null;
  }

  const recordId = getPrimaryKeyValue(model);
  if (!recordId) {
    return null;
  }

  return { collectionName, recordId };
}

/**
 * Get CDC context from hook options (stored by before hooks)
 */
export function getCdcContext(options: HookOptions): CdcContext | null {
  const cdc = options.context?.__cdc as CdcContext | undefined;
  if (!cdc || !cdc.beforeData || !cdc.recordId || !cdc.collectionName) {
    return null;
  }
  return cdc;
}

/**
 * Set CDC context in hook options (for before hooks to store data for after hooks)
 */
export function setCdcContext(options: HookOptions, context: CdcContext): void {
  options.context = options.context || {};
  options.context.__cdc = context;
}

/**
 * Create a CDC snapshot with auth info, versioning, and cleanup
 */
export async function createCdcSnapshot(
  db: Database,
  options: HookOptions,
  params: CreateSnapshotParams,
  logger?: Logger,
): Promise<void> {
  try {
    const { collectionName, recordId, operation, beforeData, afterData, changedFields } = params;

    const version = await getNextVersion(db, collectionName, recordId);
    const authInfo = await extractAuthInfo(db, options);
    const now = new Date();

    const snapshotRepo = db.getRepository('cdc_snapshots');
    await snapshotRepo.create({
      values: {
        collectionName,
        recordId,
        operation,
        beforeData,
        afterData,
        changedFields,
        userId: authInfo.userId,
        isApiKey: authInfo.isApiKey,
        createdAt: now,
        updatedAt: now,
        version,
      },
      hooks: false, // Prevent CDC hooks from firing on snapshot creation
    });

    // Update filter metadata (capturedRecords and capturedFields)
    const recordName = getRecordName(afterData || beforeData);
    await updateFilterMetadata(db, collectionName, recordId, recordName, changedFields);

    // Cleanup old snapshots based on retention/maxVersions config
    await cleanupSnapshots(db, collectionName, recordId);
  } catch (err) {
    if (logger) {
      logger.error(`[CDC] createCdcSnapshot error for ${params.collectionName}:`, err);
    }
  }
}

/**
 * Execute a callback after transaction commit (if in transaction) or immediately
 */
export function executeAfterTransaction(
  options: HookOptions,
  callback: () => Promise<void>,
): void {
  if (options.transaction) {
    options.transaction.afterCommit(callback);
  } else {
    // Execute async but don't await - let it run in background
    callback().catch(() => {
      // Error is handled inside callback
    });
  }
}
