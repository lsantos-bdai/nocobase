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
