import { Model, Database } from '@nocobase/database';
import {
  isCollectionEnabled,
  getPrimaryKeyValue,
  getPlainData,
  getChangedFields,
  getNextVersion,
  shouldAuditCollection,
  cleanupSnapshots,
  updateFilterMetadata,
  getAssociationFieldNames,
} from '../utils/snapshot-helpers';
import { extractAuthInfo } from '../utils/auth-helpers';

export interface HookOptions {
  transaction?: any;
  context?: Record<string, unknown>;
  logging?: boolean;
  hooks?: boolean;
}

export interface Logger {
  error: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  debug: (...args: any[]) => void;
}

/**
 * afterUpdate hook - saves a snapshot with before and after data
 * Uses beforeData stored in context by beforeUpdate hook
 *
 * Uses global hook pattern: extracts collection from model and checks
 * shouldAuditCollection and isCollectionEnabled before processing.
 */
export function createAfterUpdateHook(db: Database, logger?: Logger) {
  return async function afterUpdate(model: Model, options: HookOptions) {
    const { collection } = model.constructor as any;

    console.log('[CDC DEBUG] afterUpdate hook fired, collection:', collection?.name);

    if (!collection) {
      console.log('[CDC DEBUG] afterUpdate: no collection, exiting');
      return;
    }

    const collectionName = collection.name;

    // Skip if logging is disabled in options (e.g., during bulk imports)
    if (options.logging === false) {
      console.log('[CDC DEBUG] afterUpdate: logging=false for', collectionName);
      return;
    }

    // Check our exclusion list (system collections, cdc_*, ui*, etc.)
    if (!shouldAuditCollection(collectionName)) {
      console.log('[CDC DEBUG] afterUpdate: excluded collection', collectionName);
      return;
    }

    // Check cdc_config for per-collection disable
    const enabled = await isCollectionEnabled(db, collectionName);
    console.log('[CDC DEBUG] afterUpdate: isCollectionEnabled=', enabled, 'for', collectionName);
    if (!enabled) {
      return;
    }

    const recordId = getPrimaryKeyValue(model);
    if (!recordId) {
      return;
    }

    const beforeData = options.context?.__cdcBeforeData as Record<string, unknown> | undefined;
    if (!beforeData) {
      // beforeUpdate hook didn't run or failed - can't save accurate snapshot
      if (logger) {
        logger.warn(`[CDC] afterUpdate: no beforeData for ${collectionName}:${recordId}`);
      }
      return;
    }

    const saveSnapshot = async () => {
      try {
        // Fetch record with associations to get complete data
        const associations = getAssociationFieldNames(db, collectionName);
        console.log('[CDC DEBUG] afterUpdate saveSnapshot: fetching with appends=', associations);
        const updatedRecord = await db.getRepository(collectionName).findOne({
          filterByTk: recordId,
          appends: associations.length > 0 ? associations : undefined,
        });
        console.log('[CDC DEBUG] afterUpdate saveSnapshot: updatedRecord=', !!updatedRecord);
        const afterData = updatedRecord ? updatedRecord.get({ plain: true }) : getPlainData(model);
        const changedFields = getChangedFields(beforeData, afterData);

        // Skip if nothing actually changed
        if (changedFields.length === 0) {
          return;
        }

        const version = await getNextVersion(db, collectionName, recordId);
        console.log('[CDC DEBUG] afterUpdate saveSnapshot: version=', version);

        // Get auth info (user ID and/or API key info)
        console.log('[CDC DEBUG] afterUpdate saveSnapshot: calling extractAuthInfo...');
        const authInfo = await extractAuthInfo(db, options);
        console.log('[CDC DEBUG] afterUpdate saveSnapshot: authInfo=', authInfo);

        const now = new Date();
        const snapshotRepo = db.getRepository('cdc_snapshots');
        console.log('[CDC DEBUG] afterUpdate saveSnapshot: creating snapshot with values:', {
          collectionName,
          recordId,
          operation: 'update',
          changedFields,
          userId: authInfo.userId,
          isApiKey: authInfo.isApiKey,
          version,
        });
        const snapshot = await snapshotRepo.create({
          values: {
            collectionName,
            recordId,
            operation: 'update',
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
        console.log('[CDC DEBUG] afterUpdate saveSnapshot: snapshot created, id=', snapshot?.get('id'));

        // Update filter metadata (capturedRecords and capturedFields)
        const recordName = String(afterData.name || afterData.title || afterData.label || afterData.nickname || recordId);
        await updateFilterMetadata(db, collectionName, recordId, recordName, changedFields);

        // Cleanup old snapshots based on retention/maxVersions config
        await cleanupSnapshots(db, collectionName, recordId);
      } catch (err) {
        console.error(`[CDC DEBUG] afterUpdate saveSnapshot error for ${collectionName}:`, err);
        if (logger) {
          logger.error(`[CDC] afterUpdate error for ${collectionName}:`, err);
        }
      }
    };

    // Execute after transaction commit if in transaction
    if (options.transaction) {
      options.transaction.afterCommit(saveSnapshot);
    } else {
      await saveSnapshot();
    }
  };
}
