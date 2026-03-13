import { Context, Next } from '@nocobase/actions';
import {
  validateBasicAssetPayloadList,
  BasicAssetPayload,
} from '../../types/basic-asset-payload';
import { resolveCollectionBasic } from '../../utils/resolve-collection-basic';
import { ValidationError } from '../../utils/field-mapping';
import { validateBatchSize } from '../../utils/pagination';

interface BasicDeleteResult {
  deleted: number[];
  count: number;
}

/**
 * Bulk delete action for databridgeBasic (platform-free).
 *
 * Request body: list[BasicAssetPayload]
 * - collection: required (name or title)
 * - data: required (free-form object)
 * - data.id: required (identifies the record to delete)
 *
 * Two-pass: verify all records exist, then delete.
 * Response: { deleted: number[], count: number }
 * All operations are ACID — entire batch succeeds or fails atomically.
 */
export async function basicDelete(ctx: Context, next: Next) {
  const body = ctx.request.body;

  // Validate input — data.id is required for delete
  const validation = validateBasicAssetPayloadList(body, { context: 'delete' });
  if (!validation.valid) {
    ctx.throw(400, (validation as { valid: false; error: string }).error);
    return;
  }

  // Enforce batch size limit
  validateBatchSize(ctx, validation.assets as BasicAssetPayload[]);

  const assets = validation.assets as BasicAssetPayload[];
  const deletedIds: number[] = [];

  // Use a transaction for ACID guarantees
  const transaction = await ctx.db.sequelize.transaction();

  try {
    // First pass: verify all records exist and collect their info
    const assetInfos: Array<{
      id: number | string;
      collectionName: string;
    }> = [];

    for (const payload of assets) {
      // Resolve collection
      const collectionName = await resolveCollectionBasic(ctx, ctx.db, payload.collection);

      const collection = ctx.db.getCollection(collectionName);
      if (!collection) {
        throw new ValidationError([`Collection '${collectionName}' not found`]);
      }

      const assetId = payload.data.id as number | string;

      // Verify the record exists
      const existing = await ctx.db.getRepository(collectionName).findOne({
        filterByTk: assetId,
        transaction,
      });

      if (!existing) {
        ctx.status = 404;
        ctx.body = {
          error: 'Asset not found',
          details: {
            id: assetId,
            collection: collectionName,
            message: `Record with id ${assetId} not found in collection '${collectionName}'`,
          },
        };
        ctx.withoutDataWrapping = true;
        await transaction.rollback();
        return next();
      }

      assetInfos.push({ id: assetId, collectionName });
    }

    // Second pass: group by collection and delete
    const byCollection = new Map<string, (number | string)[]>();
    for (const info of assetInfos) {
      const ids = byCollection.get(info.collectionName) || [];
      ids.push(info.id);
      byCollection.set(info.collectionName, ids);
    }

    for (const [collectionName, ids] of byCollection) {
      const numericIds = ids.map((id) => {
        if (typeof id === 'number') return id;
        const num = parseInt(String(id), 10);
        return isNaN(num) ? id : num;
      });

      await ctx.db.getRepository(collectionName).destroy({
        filter: { id: { $in: numericIds } },
        transaction,
        context: ctx,
      });

      for (const id of numericIds) {
        deletedIds.push(typeof id === 'number' ? id : parseInt(String(id), 10));
      }
    }

    // Commit the transaction
    await transaction.commit();

    const result: BasicDeleteResult = {
      deleted: deletedIds,
      count: deletedIds.length,
    };

    ctx.body = result;
    ctx.withoutDataWrapping = true;
  } catch (err) {
    await transaction.rollback();

    if (err instanceof ValidationError) {
      ctx.status = 422;
      ctx.body = {
        error: 'Validation failed',
        details: {
          message: err.errors.join(', '),
        },
      };
      ctx.withoutDataWrapping = true;
      return next();
    }

    throw err;
  }

  await next();
}
