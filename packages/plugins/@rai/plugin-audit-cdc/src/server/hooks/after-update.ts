import { Model, Database } from '@nocobase/database';
import {
  isCollectionEnabled,
  getPrimaryKeyValue,
  getPlainData,
  getChangedFields,
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
        const afterData = getPlainData(model);
        const changedFields = getChangedFields(beforeData, afterData);

        // Skip if nothing actually changed
        if (changedFields.length === 0) {
          return;
        }

        const version = await getNextVersion(db, collectionName, recordId);

        // Get user ID from context if available
        const userId = options.context?.state?.currentUser?.id ?? null;

        const now = new Date();
        const snapshotRepo = db.getRepository('cdc_snapshots');
        await snapshotRepo.create({
          values: {
            collectionName,
            recordId,
            operation: 'update',
            beforeData,
            afterData,
            changedFields,
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
