import { Model, Database } from '@nocobase/database';
import {
  isCollectionEnabled,
  getPrimaryKeyValue,
  shouldAuditCollection,
  getAssociationFieldNames,
} from '../utils/snapshot-helpers';

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
 * beforeUpdate hook - captures the current record state before update
 * Stores it in options.context.__cdcBeforeData for afterUpdate to access
 *
 * Uses global hook pattern: extracts collection from model and checks
 * shouldAuditCollection and isCollectionEnabled before processing.
 */
export function createBeforeUpdateHook(db: Database, logger?: Logger) {
  return async function beforeUpdate(model: Model, options: HookOptions) {
    const { collection } = model.constructor as any;

    console.log('[CDC DEBUG] beforeUpdate hook fired, collection:', collection?.name);

    if (!collection) {
      console.log('[CDC DEBUG] beforeUpdate: no collection, exiting');
      return;
    }

    const collectionName = collection.name;

    // Skip if logging is disabled in options (e.g., during bulk imports)
    if (options.logging === false) {
      console.log('[CDC DEBUG] beforeUpdate: logging=false for', collectionName);
      return;
    }

    // Check our exclusion list (system collections, cdc_*, ui*, etc.)
    if (!shouldAuditCollection(collectionName)) {
      console.log('[CDC DEBUG] beforeUpdate: excluded collection', collectionName);
      return;
    }

    // Check cdc_config for per-collection disable
    const enabled = await isCollectionEnabled(db, collectionName);
    console.log('[CDC DEBUG] beforeUpdate: isCollectionEnabled=', enabled, 'for', collectionName);
    if (!enabled) {
      return;
    }

    const recordId = getPrimaryKeyValue(model);
    if (!recordId) {
      return;
    }

    try {
      const repo = db.getRepository(collectionName);
      const associations = getAssociationFieldNames(db, collectionName);
      console.log('[CDC DEBUG] beforeUpdate: fetching with appends=', associations);
      const currentRecord = await repo.findOne({
        filterByTk: recordId,
        transaction: options.transaction,
        appends: associations.length > 0 ? associations : undefined, // Load association data
      });

      if (currentRecord) {
        // Store in context for afterUpdate to access
        options.context = options.context || {};
        options.context.__cdcBeforeData = currentRecord.get({ plain: true });
        options.context.__cdcRecordId = recordId;
        options.context.__cdcCollectionName = collectionName;
      }
    } catch (err) {
      // Log but don't fail the operation
      console.error(`[CDC DEBUG] beforeUpdate error for ${collectionName}:`, err);
      if (logger) {
        logger.error(`[CDC] beforeUpdate error for ${collectionName}:`, err);
      }
    }
  };
}
