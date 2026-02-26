import { Model, Database } from '@nocobase/database';
import { validateHookContext, setCdcContext } from '../utils/snapshot-helpers';
import type { HookOptions, Logger } from './types';

/**
 * beforeDestroy hook - captures the current record state before deletion
 * Stores it in options.context.__cdc for afterDestroy to access
 *
 * Uses global hook pattern: extracts collection from model and checks
 * shouldAuditCollection and isCollectionEnabled before processing.
 */
export function createBeforeDestroyHook(db: Database, logger?: Logger) {
  return async function beforeDestroy(model: Model, options: HookOptions) {
    const validation = await validateHookContext(model, options, db);
    if (!validation) {
      return;
    }

    const { collectionName, recordId } = validation;

    try {
      const repo = db.getRepository(collectionName);
      const currentRecord = await repo.findOne({
        filterByTk: recordId,
        transaction: options.transaction,
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
        logger.error(`[CDC] beforeDestroy error for ${collectionName}:`, err);
      }
    }
  };
}
