import { Model, Database } from '@nocobase/database';
import {
  isCollectionEnabled,
  getPrimaryKeyValue,
  getPlainData,
  getNextVersion,
  shouldAuditCollection,
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
 * afterCreate hook - saves a snapshot with the new record data
 *
 * Uses global hook pattern: extracts collection from model and checks
 * shouldAuditCollection and isCollectionEnabled before processing.
 */
export function createAfterCreateHook(db: Database, logger?: Logger) {
  return async function afterCreate(model: Model, options: HookOptions) {
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

    const recordId = getPrimaryKeyValue(model);
    if (!recordId) {
      return;
    }

    const saveSnapshot = async () => {
      try {
        const afterData = getPlainData(model);
        const version = await getNextVersion(db, collectionName, recordId);

        // Get user ID from context if available
        const userId = options.context?.state?.currentUser?.id ?? null;

        const now = new Date();
        const snapshotRepo = db.getRepository('cdc_snapshots');
        await snapshotRepo.create({
          values: {
            collectionName,
            recordId,
            operation: 'create',
            beforeData: null,
            afterData,
            changedFields: Object.keys(afterData).filter((k) => !k.startsWith('_')),
            userId,
            createdAt: now,
            updatedAt: now,
            version,
          },
          hooks: false, // Prevent CDC hooks from firing on snapshot creation
        });
      } catch (err) {
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
