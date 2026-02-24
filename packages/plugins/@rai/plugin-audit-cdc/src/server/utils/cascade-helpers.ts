import { Database } from '@nocobase/database';

export interface PreviewItem {
  collection: string;
  recordId: string;
  recordName: string;
  action: 'restore' | 'update' | 'delete';
  currentData: Record<string, unknown> | null;
  rollbackData: Record<string, unknown> | null;
}

const MAX_CASCADE_DEPTH = 3;

/**
 * Build a list of related records that should be included in a cascade rollback
 */
export async function buildCascadePreview(
  db: Database,
  collectionName: string,
  recordId: string,
  snapshotTimestamp: Date,
  rollbackData: Record<string, unknown>,
  depth: number = 0,
  visited: Set<string> = new Set(),
): Promise<PreviewItem[]> {
  if (depth >= MAX_CASCADE_DEPTH) {
    return [];
  }

  const visitKey = `${collectionName}:${recordId}`;
  if (visited.has(visitKey)) {
    return [];
  }
  visited.add(visitKey);

  const previewItems: PreviewItem[] = [];
  const collection = db.getCollection(collectionName);

  if (!collection) {
    return [];
  }

  // Find relation fields - collection.fields is a Map, not an array
  const relationFields: Array<{ name: string; type: string; target?: string }> = [];
  for (const [, field] of collection.fields) {
    if (['belongsTo', 'hasOne', 'hasMany', 'belongsToMany'].includes(field.type)) {
      relationFields.push({
        name: field.name,
        type: field.type,
        target: field.options?.target,
      });
    }
  }

  for (const field of relationFields) {
    const fieldName = field.name;
    const fieldType = field.type;
    const targetCollection = field.target;

    if (!targetCollection) {
      continue;
    }

    // Get related record IDs from the rollback data
    const relatedValue = rollbackData[fieldName];
    const relatedIds = extractRelatedIds(relatedValue, fieldType);

    if (relatedIds.length === 0) {
      continue;
    }

    // For each related record, find the snapshot at or before the target timestamp
    const snapshotRepo = db.getRepository('cdc_snapshots');

    for (const relatedId of relatedIds) {
      // Find the most recent snapshot at or before the target timestamp
      const relatedSnapshot = await snapshotRepo.findOne({
        filter: {
          collectionName: targetCollection,
          recordId: String(relatedId),
          createdAt: { $lte: snapshotTimestamp },
        },
        sort: ['-createdAt'],
      });

      if (!relatedSnapshot) {
        continue;
      }

      // Get current state of the related record
      const relatedRepo = db.getRepository(targetCollection);
      const currentRelatedRecord = await relatedRepo.findOne({
        filterByTk: relatedId,
      });

      const relatedRollbackData =
        relatedSnapshot.get('afterData') || relatedSnapshot.get('beforeData');

      // Determine action
      let action: 'restore' | 'update' | 'delete';
      if (!currentRelatedRecord) {
        action = 'restore';
      } else {
        // Check if data is different
        const currentData = currentRelatedRecord.get({ plain: true });
        if (hasChanges(currentData, relatedRollbackData as Record<string, unknown>)) {
          action = 'update';
        } else {
          // No changes needed, skip
          continue;
        }
      }

      previewItems.push({
        collection: targetCollection,
        recordId: String(relatedId),
        recordName: getRecordName(relatedRollbackData as Record<string, unknown>),
        action,
        currentData: currentRelatedRecord ? currentRelatedRecord.get({ plain: true }) : null,
        rollbackData: relatedRollbackData as Record<string, unknown>,
      });

      // Recursively process relations (if cascade continues)
      if (relatedRollbackData && typeof relatedRollbackData === 'object') {
        const nestedItems = await buildCascadePreview(
          db,
          targetCollection,
          String(relatedId),
          snapshotTimestamp,
          relatedRollbackData as Record<string, unknown>,
          depth + 1,
          visited,
        );
        previewItems.push(...nestedItems);
      }
    }
  }

  return previewItems;
}

function extractRelatedIds(
  value: unknown,
  fieldType: string,
): string[] {
  if (!value) {
    return [];
  }

  // For belongsTo/hasOne, value might be an ID or an object with id
  if (fieldType === 'belongsTo' || fieldType === 'hasOne') {
    if (typeof value === 'object' && value !== null) {
      const obj = value as Record<string, unknown>;
      if (obj.id !== undefined) {
        return [String(obj.id)];
      }
    }
    if (typeof value === 'string' || typeof value === 'number') {
      return [String(value)];
    }
    return [];
  }

  // For hasMany/belongsToMany, value is an array
  if (fieldType === 'hasMany' || fieldType === 'belongsToMany') {
    if (Array.isArray(value)) {
      return value
        .map((item) => {
          if (typeof item === 'object' && item !== null) {
            return String((item as Record<string, unknown>).id);
          }
          if (typeof item === 'string' || typeof item === 'number') {
            return String(item);
          }
          return null;
        })
        .filter((id): id is string => id !== null);
    }
  }

  return [];
}

function hasChanges(
  current: Record<string, unknown>,
  rollback: Record<string, unknown>,
): boolean {
  // Simple comparison - check if any values differ
  const allKeys = new Set([...Object.keys(current), ...Object.keys(rollback)]);

  for (const key of allKeys) {
    // Skip internal fields
    if (key.startsWith('_') || key === 'createdAt' || key === 'updatedAt') {
      continue;
    }

    if (JSON.stringify(current[key]) !== JSON.stringify(rollback[key])) {
      return true;
    }
  }

  return false;
}

function getRecordName(data: Record<string, unknown> | null): string {
  if (!data) return 'Unknown';
  return String(
    data.name || data.title || data.label || data.nickname || data.id || 'Unknown',
  );
}
