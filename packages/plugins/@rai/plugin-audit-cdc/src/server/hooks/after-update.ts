import { Model, Database } from '@nocobase/database';
import {
  validateHookContext,
  getCdcContext,
  getPlainData,
  getChangedFields,
  getAssociationFieldNames,
  createCdcSnapshot,
  executeAfterTransaction,
} from '../utils/snapshot-helpers';
import type { HookOptions, Logger } from './types';

/**
 * afterUpdate hook - saves a snapshot with before and after data
 * Uses beforeData stored in context by beforeUpdate hook
 *
 * Uses global hook pattern: extracts collection from model and checks
 * shouldAuditCollection and isCollectionEnabled before processing.
 */
export function createAfterUpdateHook(db: Database, logger?: Logger) {
  return async function afterUpdate(model: Model, options: HookOptions) {
    const validation = await validateHookContext(model, options, db);
    if (!validation) {
      return;
    }

    const { collectionName, recordId } = validation;

    const cdcContext = getCdcContext(options);
    if (!cdcContext) {
      // beforeUpdate hook didn't run or failed - can't save accurate snapshot
      if (logger) {
        logger.warn(`[CDC] afterUpdate: no beforeData for ${collectionName}:${recordId}`);
      }
      return;
    }

    const { beforeData } = cdcContext;

    const saveSnapshot = async () => {
      // Fetch record with associations to get complete data
      const associations = getAssociationFieldNames(db, collectionName);
      const updatedRecord = await db.getRepository(collectionName).findOne({
        filterByTk: recordId,
        appends: associations.length > 0 ? associations : undefined,
      });
      const afterData = updatedRecord ? updatedRecord.get({ plain: true }) : getPlainData(model);
      const changedFields = getChangedFields(beforeData, afterData);

      // Skip if nothing actually changed
      if (changedFields.length === 0) {
        return;
      }

      await createCdcSnapshot(db, options, {
        collectionName,
        recordId,
        operation: 'update',
        beforeData,
        afterData,
        changedFields,
      }, logger);
    };

    executeAfterTransaction(options, saveSnapshot);
  };
}
