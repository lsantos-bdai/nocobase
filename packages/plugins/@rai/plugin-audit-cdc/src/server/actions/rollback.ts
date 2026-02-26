import { Context, Next } from '@nocobase/actions';
import { SchemaValidationError, validateRollbackSchema } from '../utils/schema-validator';
import { getRecordName } from '../utils/snapshot-helpers';

interface RollbackItem {
  collection: string;
  recordId: string;
  recordName: string;
  action: 'restore' | 'update' | 'delete';
  currentData: null;
  rollbackData: Record<string, unknown> | null;
}

/**
 * POST /api/cdc:rollback
 * Body:
 *   - snapshotId: ID of the snapshot to rollback to (option 1)
 *   OR
 *   - collection: Collection name
 *   - recordId: Record ID
 *   - version: Version number to rollback to (option 2)
 *
 *   - confirmed: boolean (required: true) - must be true to execute
 */
export async function rollback(ctx: Context, next: Next) {
  const body = ctx.request.body as {
    snapshotId?: number;
    collection?: string;
    recordId?: string;
    version?: number;
    confirmed?: boolean;
  };

  const { snapshotId, collection, recordId, version, confirmed } = body;

  if (confirmed !== true) {
    ctx.throw(400, 'Rollback requires confirmed: true. Use preview first to review changes.');
  }

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

  // Build list of items to rollback
  const itemsToRollback: RollbackItem[] = [];
  const rollbackData = targetSnapshot.get('beforeData') as Record<string, unknown> | null;

  // Determine action for main record
  let action: 'restore' | 'update' | 'delete';
  if (operation === 'create') {
    action = 'delete';
  } else if (operation === 'destroy') {
    action = 'restore';
  } else {
    const repo = ctx.db.getRepository(collectionName);
    const currentRecord = await repo.findOne({ filterByTk: targetRecordId });
    action = currentRecord ? 'update' : 'restore';
  }

  itemsToRollback.push({
    collection: collectionName,
    recordId: targetRecordId,
    recordName: getRecordName(rollbackData || (targetSnapshot.get('afterData') as Record<string, unknown>)),
    action,
    currentData: null,
    rollbackData: action === 'delete' ? null : rollbackData,
  });

  // Validate schema for all items before execution (defense in depth)
  const allSchemaErrors: SchemaValidationError[] = [];
  for (const item of itemsToRollback) {
    const validation = validateRollbackSchema(ctx.db, item.collection, item.rollbackData);
    if (!validation.valid) {
      allSchemaErrors.push(...validation.errors);
    }
  }

  if (allSchemaErrors.length > 0) {
    ctx.throw(400, 'Schema validation failed: snapshot contains fields that no longer exist in current schema', {
      errors: allSchemaErrors,
    });
  }

  // Execute rollback in transaction
  const transaction = await ctx.db.sequelize.transaction();
  const rolledBack: Array<{ collection: string; recordId: string; name: string; action: string }> = [];

  try {
    for (const item of itemsToRollback) {
      const repo = ctx.db.getRepository(item.collection);
      const targetCollection = ctx.db.getCollection(item.collection);

      if (!targetCollection) {
        continue;
      }

      if (item.action === 'delete') {
        // Delete the record
        await repo.destroy({
          filterByTk: item.recordId,
          transaction,
          context: ctx,
        });
      } else if (item.action === 'restore') {
        // Restore/recreate the record
        if (item.rollbackData) {
          await repo.create({
            values: item.rollbackData,
            transaction,
            context: ctx,
          });
        }
      } else if (item.action === 'update') {
        // Update the record to previous state
        if (item.rollbackData) {
          await repo.update({
            filterByTk: item.recordId,
            values: item.rollbackData,
            transaction,
            context: ctx,
          });
        }
      }

      rolledBack.push({
        collection: item.collection,
        recordId: item.recordId,
        name: item.recordName,
        action: item.action,
      });
    }

    await transaction.commit();

    // The hooks will automatically create new snapshots for these changes

    ctx.body = {
      success: true,
      rolledBack,
      message: `Successfully rolled back ${rolledBack.length} record(s)`,
    };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }

  await next();
}
