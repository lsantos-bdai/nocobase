import { Model, Database } from '@nocobase/database';
import {
  isCollectionEnabled,
  getPrimaryKeyValue,
  getNextVersion,
  shouldAuditCollection,
  cleanupSnapshots,
  updateFilterMetadata,
  getAssociationFieldNames,
  deepEqual,
} from '../utils/snapshot-helpers';
import { extractAuthInfo } from '../utils/auth-helpers';

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
    const { collection } = model.constructor as any;

    console.log('[CDC DEBUG] afterUpdateWithAssociations hook fired, collection:', collection?.name);

    if (!collection) {
      console.log('[CDC DEBUG] afterUpdateWithAssociations: no collection, exiting');
      return;
    }

    const collectionName = collection.name;

    // Skip if logging is disabled in options
    if (options.logging === false) {
      console.log('[CDC DEBUG] afterUpdateWithAssociations: logging=false for', collectionName);
      return;
    }

    // Check our exclusion list (system collections, cdc_*, ui*, etc.)
    if (!shouldAuditCollection(collectionName)) {
      console.log('[CDC DEBUG] afterUpdateWithAssociations: excluded collection', collectionName);
      return;
    }

    // Check cdc_config for per-collection disable
    const enabled = await isCollectionEnabled(db, collectionName);
    console.log('[CDC DEBUG] afterUpdateWithAssociations: isCollectionEnabled=', enabled, 'for', collectionName);
    if (!enabled) {
      return;
    }

    const recordId = getPrimaryKeyValue(model);
    if (!recordId) {
      console.log('[CDC DEBUG] afterUpdateWithAssociations: no recordId');
      return;
    }

    // Get association field names for this collection
    const associationFields = getAssociationFieldNames(db, collectionName);
    console.log('[CDC DEBUG] afterUpdateWithAssociations: associationFields=', associationFields);

    if (associationFields.length === 0) {
      // No associations on this collection, nothing to track here
      console.log('[CDC DEBUG] afterUpdateWithAssociations: no association fields on collection, skipping');
      return;
    }

    // Get the beforeData from context (stored by beforeUpdate hook)
    const beforeData = options.context?.__cdcBeforeData as Record<string, unknown> | undefined;
    if (!beforeData) {
      console.log('[CDC DEBUG] afterUpdateWithAssociations: no beforeData in context');
      if (logger) {
        logger.warn(`[CDC] afterUpdateWithAssociations: no beforeData for ${collectionName}:${recordId}`);
      }
      return;
    }

    const saveSnapshot = async () => {
      try {
        console.log('[CDC DEBUG] afterUpdateWithAssociations saveSnapshot: starting for', collectionName, recordId);

        // Fetch current record with associations
        console.log('[CDC DEBUG] afterUpdateWithAssociations saveSnapshot: fetching with appends=', associationFields);
        const updatedRecord = await db.getRepository(collectionName).findOne({
          filterByTk: recordId,
          appends: associationFields,
        });

        if (!updatedRecord) {
          console.log('[CDC DEBUG] afterUpdateWithAssociations saveSnapshot: record not found');
          return;
        }

        const afterData = updatedRecord.get({ plain: true });

        // Compare only association fields between beforeData and afterData
        // This replaces the unreliable changedWithAssociations() method
        const changedAssociations = associationFields.filter((field) => {
          const before = beforeData[field];
          const after = afterData[field];
          const changed = !deepEqual(before, after);
          if (changed) {
            console.log(`[CDC DEBUG] afterUpdateWithAssociations: field "${field}" changed`, {
              before: JSON.stringify(before)?.slice(0, 100),
              after: JSON.stringify(after)?.slice(0, 100),
            });
          }
          return changed;
        });

        console.log('[CDC DEBUG] afterUpdateWithAssociations saveSnapshot: changedAssociations=', changedAssociations);

        if (changedAssociations.length === 0) {
          // No association changes detected
          console.log('[CDC DEBUG] afterUpdateWithAssociations saveSnapshot: no association changes, skipping');
          return;
        }

        // The changed fields are the association fields that changed
        const changedFields = changedAssociations;

        const version = await getNextVersion(db, collectionName, recordId);
        console.log('[CDC DEBUG] afterUpdateWithAssociations saveSnapshot: version=', version);

        // Get auth info
        console.log('[CDC DEBUG] afterUpdateWithAssociations saveSnapshot: calling extractAuthInfo...');
        const authInfo = await extractAuthInfo(db, options);
        console.log('[CDC DEBUG] afterUpdateWithAssociations saveSnapshot: authInfo=', authInfo);

        const now = new Date();
        const snapshotRepo = db.getRepository('cdc_snapshots');
        console.log('[CDC DEBUG] afterUpdateWithAssociations saveSnapshot: creating snapshot with values:', {
          collectionName,
          recordId,
          operation: 'update',
          changedFields,
          userId: authInfo.userId,
          isApiKey: authInfo.isApiKey,
          version,
        });

        const snapshot = await snapshotRepo.create({
          values: {
            collectionName,
            recordId,
            operation: 'update',
            beforeData,
            afterData,
            changedFields,
            userId: authInfo.userId,
            isApiKey: authInfo.isApiKey,
            createdAt: now,
            updatedAt: now,
            version,
          },
          hooks: false,
        });
        console.log('[CDC DEBUG] afterUpdateWithAssociations saveSnapshot: snapshot created, id=', snapshot?.get('id'));

        // Update filter metadata
        const recordName = String(
          afterData.name || afterData.title || afterData.label || afterData.nickname || recordId
        );
        await updateFilterMetadata(db, collectionName, recordId, recordName, changedFields);

        // Cleanup old snapshots
        await cleanupSnapshots(db, collectionName, recordId);
        console.log('[CDC DEBUG] afterUpdateWithAssociations saveSnapshot: done for', collectionName, recordId);
      } catch (err) {
        console.error(`[CDC DEBUG] afterUpdateWithAssociations saveSnapshot error for ${collectionName}:`, err);
        if (logger) {
          logger.error(`[CDC] afterUpdateWithAssociations error for ${collectionName}:`, err);
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
