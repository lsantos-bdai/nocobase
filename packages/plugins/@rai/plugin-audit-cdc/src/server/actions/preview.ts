import { Context, Next } from '@nocobase/actions';
import { buildCascadePreview, PreviewItem } from '../utils/cascade-helpers';

/**
 * POST /api/cdc:preview
 * Body:
 *   - snapshotId: ID of the snapshot to rollback to (option 1)
 *   OR
 *   - collection: Collection name
 *   - recordId: Record ID
 *   - version: Version number to rollback to (option 2)
 *
 *   - cascade: boolean (optional, default: false) - whether to include related records
 */
export async function preview(ctx: Context, next: Next) {
  const body = ctx.request.body as {
    snapshotId?: number;
    collection?: string;
    recordId?: string;
    version?: number;
    cascade?: boolean;
  };

  const { snapshotId, collection, recordId, version, cascade = false } = body;

  const snapshotRepo = ctx.db.getRepository('cdc_snapshots');
  let targetSnapshot;

  if (snapshotId) {
    targetSnapshot = await snapshotRepo.findOne({
      filterByTk: snapshotId,
    });
  } else if (collection && recordId && version !== undefined) {
    targetSnapshot = await snapshotRepo.findOne({
      filter: {
        collectionName: collection,
        recordId: String(recordId),
        version: Number(version),
      },
    });
  } else {
    ctx.throw(400, 'Either snapshotId or (collection, recordId, version) are required');
  }

  if (!targetSnapshot) {
    ctx.throw(404, 'Target snapshot not found');
  }

  const collectionName = targetSnapshot.get('collectionName') as string;
  const targetRecordId = targetSnapshot.get('recordId') as string;
  const operation = targetSnapshot.get('operation') as string;
  const snapshotData = targetSnapshot.get('afterData') || targetSnapshot.get('beforeData');

  // Get current state of the record
  const targetCollection = ctx.db.getCollection(collectionName);
  if (!targetCollection) {
    ctx.throw(400, `Collection '${collectionName}' not found`);
  }

  const repo = ctx.db.getRepository(collectionName);
  const currentRecord = await repo.findOne({
    filterByTk: targetRecordId,
  });

  // Determine what action will be taken
  let action: 'restore' | 'update' | 'delete';
  let rollbackData: Record<string, unknown> | null = null;

  if (operation === 'create') {
    // Rolling back a create means deleting the record
    action = 'delete';
    rollbackData = null;
  } else if (operation === 'destroy') {
    // Rolling back a destroy means restoring the record
    action = 'restore';
    rollbackData = targetSnapshot.get('beforeData') as Record<string, unknown>;
  } else {
    // Rolling back an update means restoring to the before state
    action = currentRecord ? 'update' : 'restore';
    rollbackData = targetSnapshot.get('beforeData') as Record<string, unknown>;
  }

  const previewItems: PreviewItem[] = [
    {
      collection: collectionName,
      recordId: targetRecordId,
      recordName: getRecordName(snapshotData as Record<string, unknown>),
      action,
      currentData: currentRecord ? currentRecord.get({ plain: true }) : null,
      rollbackData,
    },
  ];

  // If cascade is requested, find related records to rollback
  if (cascade && rollbackData) {
    const cascadeItems = await buildCascadePreview(
      ctx.db,
      collectionName,
      targetRecordId,
      targetSnapshot.get('createdAt') as Date,
      rollbackData,
    );
    previewItems.push(...cascadeItems);
  }

  ctx.body = {
    preview: previewItems,
    affectedRecords: previewItems.length,
    targetSnapshot: {
      id: targetSnapshot.get('id'),
      version: targetSnapshot.get('version'),
      operation: targetSnapshot.get('operation'),
      createdAt: targetSnapshot.get('createdAt'),
    },
  };

  await next();
}

function getRecordName(data: Record<string, unknown> | null): string {
  if (!data) return 'Unknown';
  return String(
    data.name || data.title || data.label || data.nickname || data.id || 'Unknown',
  );
}
