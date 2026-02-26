import { Context, Next } from '@nocobase/actions';
import { SchemaValidationError, validateRollbackSchema } from '../utils/schema-validator';
import { resolveFieldMetadata } from './configure';
import { getAssociationFieldNames, getRecordName, getChangedFields, SYSTEM_FIELDS_ARRAY } from '../utils/snapshot-helpers';

interface PreviewItem {
  collection: string;
  recordId: string;
  recordName: string;
  action: 'restore' | 'update' | 'delete';
  currentData: Record<string, unknown> | null;
  rollbackData: Record<string, unknown> | null;
  schemaErrors?: SchemaValidationError[];
}

/**
 * Remove system-managed fields from data object for cleaner preview
 */
function stripSystemFields(data: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!data) return null;
  const result = { ...data };
  for (const field of SYSTEM_FIELDS_ARRAY) {
    delete result[field];
  }
  return result;
}

/**
 * POST /api/cdc:preview
 * Body:
 *   - snapshotId: ID of the snapshot to rollback to (option 1)
 *   OR
 *   - collection: Collection name
 *   - recordId: Record ID
 *   - version: Version number to rollback to (option 2)
 */
export async function preview(ctx: Context, next: Next) {
  const body = ctx.request.body as {
    snapshotId?: number;
    collection?: string;
    recordId?: string;
    version?: number;
  };

  const { snapshotId, collection, recordId, version } = body;

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
  const associations = getAssociationFieldNames(ctx.db, collectionName);
  const currentRecord = await repo.findOne({
    filterByTk: targetRecordId,
    appends: associations.length > 0 ? associations : undefined,
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

  // Validate schema for the main rollback item
  const mainSchemaValidation = validateRollbackSchema(ctx.db, collectionName, rollbackData);

  // Compute changed fields between current state and rollback data
  const currentDataPlain = stripSystemFields(currentRecord ? currentRecord.get({ plain: true }) : null);
  const rollbackDataStripped = stripSystemFields(rollbackData);
  const changedFields = getChangedFields(currentDataPlain, rollbackDataStripped);

  const previewItems: PreviewItem[] = [
    {
      collection: collectionName,
      recordId: targetRecordId,
      recordName: getRecordName(snapshotData as Record<string, unknown>),
      action,
      currentData: currentDataPlain,
      rollbackData: rollbackDataStripped,
      schemaErrors: mainSchemaValidation.errors.length > 0 ? mainSchemaValidation.errors : undefined,
    },
  ];

  // Check if any items have schema errors
  const hasSchemaErrors = previewItems.some(
    (item) => item.schemaErrors && item.schemaErrors.length > 0,
  );

  // Determine if rollback can proceed (no schema errors)
  const canRollback = !hasSchemaErrors;

  // Resolve field metadata for human-readable labels and related values
  const metadata = await resolveFieldMetadata(ctx.db, collectionName, [targetSnapshot]);

  ctx.body = {
    canRollback,
    preview: previewItems,
    changedFields,
    affectedRecords: previewItems.length,
    hasSchemaErrors,
    fieldLabels: metadata.fieldLabels,
    relatedValues: metadata.relatedValues,
    targetSnapshot: {
      id: targetSnapshot.get('id'),
      version: targetSnapshot.get('version'),
      operation: targetSnapshot.get('operation'),
      createdAt: targetSnapshot.get('createdAt'),
    },
  };

  await next();
}
