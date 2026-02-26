import { Model, Database } from '@nocobase/database';
import {
  validateHookContext,
  getCdcContext,
  createCdcSnapshot,
  executeAfterTransaction,
} from '../utils/snapshot-helpers';
import type { HookOptions, Logger } from './types';

/**
 * afterDestroy hook - saves a snapshot with the deleted record data
 * Uses beforeData stored in context by beforeDestroy hook
 *
 * Uses global hook pattern: extracts collection from model and checks
 * shouldAuditCollection and isCollectionEnabled before processing.
 */
export function createAfterDestroyHook(db: Database, logger?: Logger) {
  return async function afterDestroy(model: Model, options: HookOptions) {
    const validation = await validateHookContext(model, options, db);
    if (!validation) {
      return;
    }

    const { collectionName } = validation;

    const cdcContext = getCdcContext(options);
    if (!cdcContext) {
      // beforeDestroy hook didn't run or failed - can't save accurate snapshot
      if (logger) {
        logger.warn(`[CDC] afterDestroy: no beforeData for ${collectionName}`);
      }
      return;
    }

    const { beforeData, recordId } = cdcContext;

    const saveSnapshot = async () => {
      await createCdcSnapshot(db, options, {
        collectionName,
        recordId,
        operation: 'destroy',
        beforeData,
        afterData: null,
        changedFields: Object.keys(beforeData).filter((k) => !k.startsWith('_')),
      }, logger);
    };

    executeAfterTransaction(options, saveSnapshot);
  };
}
