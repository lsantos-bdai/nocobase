import { Model, Database } from '@nocobase/database';
import {
  isCollectionEnabled,
  getNextVersion,
  shouldAuditCollection,
  cleanupSnapshots,
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
 * afterDestroy hook - saves a snapshot with the deleted record data
 * Uses beforeData stored in context by beforeDestroy hook
 *
 * Uses global hook pattern: extracts collection from model and checks
 * shouldAuditCollection and isCollectionEnabled before processing.
 */
export function createAfterDestroyHook(db: Database, logger?: Logger) {
  return async function afterDestroy(model: Model, options: HookOptions) {
    const { collection } = model.constructor as any;

    console.log('[CDC DEBUG] afterDestroy hook fired, collection:', collection?.name);

    if (!collection) {
      console.log('[CDC DEBUG] afterDestroy: no collection, exiting');
      return;
    }

    const collectionName = collection.name;

    // Skip if logging is disabled in options (e.g., during bulk imports)
    if (options.logging === false) {
      console.log('[CDC DEBUG] afterDestroy: logging=false for', collectionName);
      return;
    }

    // Check our exclusion list (system collections, cdc_*, ui*, etc.)
    if (!shouldAuditCollection(collectionName)) {
      console.log('[CDC DEBUG] afterDestroy: excluded collection', collectionName);
      return;
    }

    // Check cdc_config for per-collection disable
    const enabled = await isCollectionEnabled(db, collectionName);
    console.log('[CDC DEBUG] afterDestroy: isCollectionEnabled=', enabled, 'for', collectionName);
    if (!enabled) {
      return;
    }

    const recordId = options.context?.__cdcRecordId as string | undefined;
    const beforeData = options.context?.__cdcBeforeData as Record<string, unknown> | undefined;
    console.log('[CDC DEBUG] afterDestroy: recordId=', recordId, 'beforeData exists=', !!beforeData);

    if (!recordId || !beforeData) {
      // beforeDestroy hook didn't run or failed - can't save accurate snapshot
      console.log('[CDC DEBUG] afterDestroy: no recordId or beforeData for', collectionName);
      if (logger) {
        logger.warn(`[CDC] afterDestroy: no beforeData for ${collectionName}`);
      }
      return;
    }

    const saveSnapshot = async () => {
      try {
        console.log('[CDC DEBUG] afterDestroy saveSnapshot: starting for', collectionName, recordId);
        const version = await getNextVersion(db, collectionName, recordId);

        console.log('[CDC DEBUG] afterDestroy saveSnapshot: calling extractAuthInfo...');
        // Get auth info (user ID and/or API key info)
        const authInfo = await extractAuthInfo(db, options);
        console.log('[CDC DEBUG] afterDestroy saveSnapshot: authInfo=', authInfo);

        const now = new Date();
        const snapshotRepo = db.getRepository('cdc_snapshots');
        console.log('[CDC DEBUG] afterDestroy saveSnapshot: creating snapshot with values:', {
          collectionName,
          recordId,
          operation: 'destroy',
          userId: authInfo.userId,
          isApiKey: authInfo.isApiKey,
          version,
        });
        const snapshot = await snapshotRepo.create({
          values: {
            collectionName,
            recordId,
            operation: 'destroy',
            beforeData,
            afterData: null,
            changedFields: Object.keys(beforeData).filter((k) => !k.startsWith('_')),
            userId: authInfo.userId,
            isApiKey: authInfo.isApiKey,
            createdAt: now,
            updatedAt: now,
            version,
          },
          hooks: false, // Prevent CDC hooks from firing on snapshot creation
        });
        console.log('[CDC DEBUG] afterDestroy saveSnapshot: snapshot created, id=', snapshot?.get('id'));

        // Cleanup old snapshots based on retention/maxVersions config
        await cleanupSnapshots(db, collectionName, recordId);
        console.log('[CDC DEBUG] afterDestroy saveSnapshot: done for', collectionName, recordId);
      } catch (err) {
        console.error('[CDC DEBUG] afterDestroy saveSnapshot error for', collectionName, ':', err);
        if (logger) {
          logger.error(`[CDC] afterDestroy error for ${collectionName}:`, err);
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
