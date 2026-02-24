import { Database, Repository, Model } from '@nocobase/database';

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
    const beforeValue = beforeData[key];
    const afterValue = afterData[key];

    // Skip internal fields
    if (key.startsWith('_')) {
      continue;
    }

    // Compare values (simple JSON comparison)
    if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
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
 *
 * @param db - Database instance
 * @param collectionName - Collection name
 * @param recordId - Record ID (for maxVersions cleanup)
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
}
