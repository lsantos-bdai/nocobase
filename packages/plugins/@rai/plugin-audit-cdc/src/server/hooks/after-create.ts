import { Model, Database } from '@nocobase/database';
import {
  validateHookContext,
  getPlainData,
  createCdcSnapshot,
  executeAfterTransaction,
} from '../utils/snapshot-helpers';
import type { HookOptions, Logger } from './types';

/**
 * afterCreate hook - saves a snapshot with the new record data
 *
 * Uses global hook pattern: extracts collection from model and checks
 * shouldAuditCollection and isCollectionEnabled before processing.
 */
export function createAfterCreateHook(db: Database, logger?: Logger) {
  return async function afterCreate(model: Model, options: HookOptions) {
    const validation = await validateHookContext(model, options, db);
    if (!validation) {
      return;
    }

    const { collectionName, recordId } = validation;

    const saveSnapshot = async () => {
      const afterData = getPlainData(model);
      const changedFields = Object.keys(afterData).filter((k) => !k.startsWith('_'));

      await createCdcSnapshot(db, options, {
        collectionName,
        recordId,
        operation: 'create',
        beforeData: null,
        afterData,
        changedFields,
      }, logger);
    };

    executeAfterTransaction(options, saveSnapshot);
  };
}
