import { Context, Next } from '@nocobase/actions';

/**
 * GET /api/cdc:history
 * Query params:
 *   - collection: Collection name (required)
 *   - recordId: Record ID (required)
 *   - limit: Max number of snapshots to return (default: 50)
 *   - offset: Pagination offset (default: 0)
 */
export async function history(ctx: Context, next: Next) {
  const { collection, recordId, limit = 50, offset = 0 } = ctx.action.params;

  if (!collection) {
    ctx.throw(400, 'collection query parameter is required');
  }

  if (!recordId) {
    ctx.throw(400, 'recordId query parameter is required');
  }

  const snapshotRepo = ctx.db.getRepository('cdc_snapshots');

  // Get total count
  const total = await snapshotRepo.count({
    filter: {
      collectionName: collection,
      recordId: String(recordId),
    },
  });

  // Get snapshots with pagination, ordered by version descending
  const snapshots = await snapshotRepo.find({
    filter: {
      collectionName: collection,
      recordId: String(recordId),
    },
    sort: ['-version'],
    limit: Number(limit),
    offset: Number(offset),
    appends: ['user'],
  });

  ctx.body = {
    data: snapshots.map((s) => ({
      id: s.get('id'),
      version: s.get('version'),
      operation: s.get('operation'),
      changedFields: s.get('changedFields'),
      user: s.get('user')
        ? {
            id: s.get('user').get('id'),
            nickname: s.get('user').get('nickname'),
            email: s.get('user').get('email'),
          }
        : null,
      createdAt: s.get('createdAt'),
    })),
    meta: {
      total,
      limit: Number(limit),
      offset: Number(offset),
    },
  };

  await next();
}
