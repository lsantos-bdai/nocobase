import { Model, Database } from '@nocobase/database';
import {
  isCollectionEnabled,
  getNextVersion,
  shouldAuditCollection,
  cleanupSnapshots,
} from '../utils/snapshot-helpers';

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
    if (!collection) {
      return;
    }

    const collectionName = collection.name;

    // Skip if logging is disabled in options (e.g., during bulk imports)
    if (options.logging === false) {
      return;
    }

    // Check our exclusion list (system collections, cdc_*, ui*, etc.)
    if (!shouldAuditCollection(collectionName)) {
      return;
    }

    // Check cdc_config for per-collection disable
    const enabled = await isCollectionEnabled(db, collectionName);
    if (!enabled) {
      return;
    }

    const recordId = options.context?.__cdcRecordId as string | undefined;
    const beforeData = options.context?.__cdcBeforeData as Record<string, unknown> | undefined;

    if (!recordId || !beforeData) {
      // beforeDestroy hook didn't run or failed - can't save accurate snapshot
      if (logger) {
        logger.warn(`[CDC] afterDestroy: no beforeData for ${collectionName}`);
      }
      return;
    }

    const saveSnapshot = async () => {
      try {
        const version = await getNextVersion(db, collectionName, recordId);

        // Get user ID from context if available
        const userId = options.context?.state?.currentUser?.id ?? null;

        const now = new Date();
        const snapshotRepo = db.getRepository('cdc_snapshots');
        await snapshotRepo.create({
          values: {
            collectionName,
            recordId,
            operation: 'destroy',
            beforeData,
            afterData: null,
            changedFields: Object.keys(beforeData).filter((k) => !k.startsWith('_')),
            userId,
            createdAt: now,
            updatedAt: now,
            version,
          },
          hooks: false, // Prevent CDC hooks from firing on snapshot creation
        });

        // Cleanup old snapshots based on retention/maxVersions config
        await cleanupSnapshots(db, collectionName, recordId);
      } catch (err) {
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
