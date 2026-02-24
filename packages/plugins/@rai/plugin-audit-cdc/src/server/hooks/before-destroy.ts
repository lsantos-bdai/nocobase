import { Model, Database } from '@nocobase/database';
import { isCollectionEnabled, getPrimaryKeyValue, shouldAuditCollection } from '../utils/snapshot-helpers';

export interface HookOptions {
  transaction?: any;
  context?: Record<string, unknown>;
  logging?: boolean;
}

export interface Logger {
  error: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  debug: (...args: any[]) => void;
}

/**
 * beforeDestroy hook - captures the current record state before deletion
 * Stores it in options.context.__cdcBeforeData for afterDestroy to access
 *
 * Uses global hook pattern: extracts collection from model and checks
 * shouldAuditCollection and isCollectionEnabled before processing.
 */
export function createBeforeDestroyHook(db: Database, logger?: Logger) {
  return async function beforeDestroy(model: Model, options: HookOptions) {
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

    try {
      const repo = db.getRepository(collectionName);
      const currentRecord = await repo.findOne({
        filterByTk: recordId,
        transaction: options.transaction,
      });

      if (currentRecord) {
        // Store in context for afterDestroy to access
        options.context = options.context || {};
        options.context.__cdcBeforeData = currentRecord.get({ plain: true });
        options.context.__cdcRecordId = recordId;
        options.context.__cdcCollectionName = collectionName;
      }
    } catch (err) {
      // Log but don't fail the operation
      if (logger) {
        logger.error(`[CDC] beforeDestroy error for ${collectionName}:`, err);
      }
    }
  };
}
