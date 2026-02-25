import { Model, Database } from '@nocobase/database';
import {
  isCollectionEnabled,
  getPrimaryKeyValue,
  getPlainData,
  getNextVersion,
  shouldAuditCollection,
  cleanupSnapshots,
  updateFilterMetadata,
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
 * afterCreate hook - saves a snapshot with the new record data
 *
 * Uses global hook pattern: extracts collection from model and checks
 * shouldAuditCollection and isCollectionEnabled before processing.
 */
export function createAfterCreateHook(db: Database, logger?: Logger) {
  return async function afterCreate(model: Model, options: HookOptions) {
    const { collection } = model.constructor as any;

    console.log('[CDC DEBUG] afterCreate hook fired, collection:', collection?.name);

    if (!collection) {
      console.log('[CDC DEBUG] afterCreate: no collection, exiting');
      return;
    }

    const collectionName = collection.name;

    // Skip if logging is disabled in options (e.g., during bulk imports)
    if (options.logging === false) {
      console.log('[CDC DEBUG] afterCreate: logging=false for', collectionName);
      return;
    }

    // Check our exclusion list (system collections, cdc_*, ui*, etc.)
    if (!shouldAuditCollection(collectionName)) {
      console.log('[CDC DEBUG] afterCreate: excluded collection', collectionName);
      return;
    }

    // Check cdc_config for per-collection disable
    const enabled = await isCollectionEnabled(db, collectionName);
    console.log('[CDC DEBUG] afterCreate: isCollectionEnabled=', enabled, 'for', collectionName);
    if (!enabled) {
      return;
    }

    const recordId = getPrimaryKeyValue(model);
    console.log('[CDC DEBUG] afterCreate: recordId=', recordId);
    if (!recordId) {
      return;
    }

    const saveSnapshot = async () => {
      try {
        console.log('[CDC DEBUG] afterCreate saveSnapshot: starting for', collectionName, recordId);
        const afterData = getPlainData(model);
        const version = await getNextVersion(db, collectionName, recordId);
        const changedFields = Object.keys(afterData).filter((k) => !k.startsWith('_'));

        console.log('[CDC DEBUG] afterCreate saveSnapshot: calling extractAuthInfo...');
        // Get auth info (user ID and/or API key info)
        const authInfo = await extractAuthInfo(db, options);
        console.log('[CDC DEBUG] afterCreate saveSnapshot: authInfo=', authInfo);

        const now = new Date();
        const snapshotRepo = db.getRepository('cdc_snapshots');
        console.log('[CDC DEBUG] afterCreate saveSnapshot: creating snapshot with values:', {
          collectionName,
          recordId,
          operation: 'create',
          changedFields,
          userId: authInfo.userId,
          isApiKey: authInfo.isApiKey,
          version,
        });
        const snapshot = await snapshotRepo.create({
          values: {
            collectionName,
            recordId,
            operation: 'create',
            beforeData: null,
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
        console.log('[CDC DEBUG] afterCreate saveSnapshot: snapshot created, id=', snapshot?.get('id'));

        // Update filter metadata (capturedRecords and capturedFields)
        const recordName = String(afterData.name || afterData.title || afterData.label || afterData.nickname || recordId);
        await updateFilterMetadata(db, collectionName, recordId, recordName, changedFields);

        // Cleanup old snapshots based on retention/maxVersions config
        await cleanupSnapshots(db, collectionName, recordId);
        console.log('[CDC DEBUG] afterCreate saveSnapshot: done for', collectionName, recordId);
      } catch (err) {
        console.error('[CDC DEBUG] afterCreate saveSnapshot error for', collectionName, ':', err);
        if (logger) {
          logger.error(`[CDC] afterCreate error for ${collectionName}:`, err);
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
