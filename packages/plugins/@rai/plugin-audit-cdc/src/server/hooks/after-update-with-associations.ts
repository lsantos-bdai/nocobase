import { Model, Database } from '@nocobase/database';
import {
  validateHookContext,
  getCdcContext,
  getAssociationFieldNames,
  getChangedFields,
  createCdcSnapshot,
  executeAfterTransaction,
} from '../utils/snapshot-helpers';
import type { HookOptions, Logger } from './types';

/**
 * afterUpdateWithAssociations hook - captures updates that include association changes
 *
 * This hook fires AFTER associations are updated (unlike afterUpdate which only fires
 * when scalar fields change). It compares beforeData (from context) with freshly-fetched
 * afterData to detect association changes, since changedWithAssociations() is unreliable.
 *
 * To avoid duplicate snapshots (when both scalar and association fields change),
 * we only track association field changes here - scalar fields are handled by afterUpdate.
 */
export function createAfterUpdateWithAssociationsHook(db: Database, logger?: Logger) {
  return async function afterUpdateWithAssociations(model: Model, options: HookOptions) {
    const validation = await validateHookContext(model, options, db);
    if (!validation) {
      return;
    }

    const { collectionName, recordId } = validation;

    // Get association field names for this collection
    const associationFields = getAssociationFieldNames(db, collectionName);
    if (associationFields.length === 0) {
      // No associations on this collection, nothing to track here
      return;
    }

    // Get the beforeData from context (stored by beforeUpdate hook)
    const cdcContext = getCdcContext(options);
    if (!cdcContext) {
      if (logger) {
        logger.warn(`[CDC] afterUpdateWithAssociations: no beforeData for ${collectionName}:${recordId}`);
      }
      return;
    }

    const { beforeData } = cdcContext;

    const saveSnapshot = async () => {
      // Fetch current record with associations
      const updatedRecord = await db.getRepository(collectionName).findOne({
        filterByTk: recordId,
        appends: associationFields,
      });

      if (!updatedRecord) {
        return;
      }

      const afterData = updatedRecord.get({ plain: true });

      // Compare only association fields between beforeData and afterData
      // Use getChangedFields which handles ID-based comparison for relations
      const allChangedFields = getChangedFields(beforeData, afterData);
      const changedAssociations = associationFields.filter((field) => allChangedFields.includes(field));

      if (changedAssociations.length === 0) {
        // No association changes detected
        return;
      }

      await createCdcSnapshot(db, options, {
        collectionName,
        recordId,
        operation: 'update',
        beforeData,
        afterData,
        changedFields: changedAssociations,
      }, logger);
    };

    executeAfterTransaction(options, saveSnapshot);
  };
}
