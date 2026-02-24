import { Context, Next } from '@nocobase/actions';

/**
 * GET /api/cdc:snapshot
 * Query params:
 *   - id: Snapshot ID (required)
 *
 * Alternative params (to get by version):
 *   - collection: Collection name
 *   - recordId: Record ID
 *   - version: Version number
 */
export async function snapshot(ctx: Context, next: Next) {
  const { id, collection, recordId, version } = ctx.action.params;

  const snapshotRepo = ctx.db.getRepository('cdc_snapshots');
  let snapshotRecord;

  if (id) {
    // Get by ID
    snapshotRecord = await snapshotRepo.findOne({
      filterByTk: id,
      appends: ['user'],
    });
  } else if (collection && recordId && version) {
    // Get by collection, recordId, and version
    snapshotRecord = await snapshotRepo.findOne({
      filter: {
        collectionName: collection,
        recordId: String(recordId),
        version: Number(version),
      },
      appends: ['user'],
    });
  } else {
    ctx.throw(400, 'Either id or (collection, recordId, version) parameters are required');
  }

  if (!snapshotRecord) {
    ctx.throw(404, 'Snapshot not found');
  }

  ctx.body = {
    id: snapshotRecord.get('id'),
    collectionName: snapshotRecord.get('collectionName'),
    recordId: snapshotRecord.get('recordId'),
    version: snapshotRecord.get('version'),
    operation: snapshotRecord.get('operation'),
    beforeData: snapshotRecord.get('beforeData'),
    afterData: snapshotRecord.get('afterData'),
    changedFields: snapshotRecord.get('changedFields'),
    user: snapshotRecord.get('user')
      ? {
          id: snapshotRecord.get('user').get('id'),
          nickname: snapshotRecord.get('user').get('nickname'),
          email: snapshotRecord.get('user').get('email'),
        }
      : null,
    createdAt: snapshotRecord.get('createdAt'),
  };

  await next();
}
