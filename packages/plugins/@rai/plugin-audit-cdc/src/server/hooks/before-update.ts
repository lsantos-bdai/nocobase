import { Model, Database } from '@nocobase/database';
import {
  validateHookContext,
  setCdcContext,
  getAssociationFieldNames,
} from '../utils/snapshot-helpers';
import type { HookOptions, Logger } from './types';

/**
 * beforeUpdate hook - captures the current record state before update
 * Stores it in options.context.__cdc for afterUpdate to access
 *
 * Uses global hook pattern: extracts collection from model and checks
 * shouldAuditCollection and isCollectionEnabled before processing.
 */
export function createBeforeUpdateHook(db: Database, logger?: Logger) {
  return async function beforeUpdate(model: Model, options: HookOptions) {
    const validation = await validateHookContext(model, options, db);
    if (!validation) {
      return;
    }

    const { collectionName, recordId } = validation;

    try {
      const repo = db.getRepository(collectionName);
      const associations = getAssociationFieldNames(db, collectionName);
      const currentRecord = await repo.findOne({
        filterByTk: recordId,
        transaction: options.transaction,
        appends: associations.length > 0 ? associations : undefined,
      });

      if (currentRecord) {
        setCdcContext(options, {
          beforeData: currentRecord.get({ plain: true }),
          recordId,
          collectionName,
        });
      }
    } catch (err) {
      if (logger) {
        logger.error(`[CDC] beforeUpdate error for ${collectionName}:`, err);
      }
    }
  };
}
