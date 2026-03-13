import { Context, Next } from '@nocobase/actions';
import {
  validateBasicAssetPayloadList,
  BasicAssetPayload,
} from '../../types/basic-asset-payload';
import { resolveCollectionBasic } from '../../utils/resolve-collection-basic';
import { unresolveDataBasic } from '../../utils/fetch-assets-basic';
import {
  validateFieldValues,
  ValidationError,
} from '../../utils/field-mapping';
import { validateBatchSize } from '../../utils/pagination';

interface BasicUpdateResult {
  updated: number[];
  count: number;
}

/**
 * Bulk update action for databridgeBasic (platform-free).
 *
 * Request body: list[BasicAssetPayload]
 * - collection: required (name or title)
 * - data: required (free-form object)
 * - data.id: required (identifies the record to update)
 *
 * Response: { updated: number[], count: number }
 * All operations are ACID — entire batch succeeds or fails atomically.
 */
export async function basicUpdate(ctx: Context, next: Next) {
  const body = ctx.request.body;

  // Validate input — data.id is required for update
  const validation = validateBasicAssetPayloadList(body, { context: 'update' });
  if (!validation.valid) {
    ctx.throw(400, (validation as { valid: false; error: string }).error);
    return;
  }

  // Enforce batch size limit
  validateBatchSize(ctx, validation.assets as BasicAssetPayload[]);

  const assets = validation.assets as BasicAssetPayload[];
  const updatedIds: number[] = [];

  // Use a transaction for ACID guarantees
  const transaction = await ctx.db.sequelize.transaction();

  try {
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

      // Validate field values (types, enums, etc.)
      const valueErrors = await validateFieldValues(collection, payload.data, ctx.db);
      if (valueErrors.length > 0) {
        throw new ValidationError(valueErrors);
      }

      // Convert human-readable data to internal format
      const internalData = await unresolveDataBasic(collection, payload.data);

      // Remove 'id' from update values (used for identifying, not updating)
      const { id, ...updateValues } = internalData;

      // Perform the update
      await ctx.db.getRepository(collectionName).update({
        filterByTk: assetId,
        values: updateValues,
        transaction,
        context: ctx,
      });

      updatedIds.push(typeof assetId === 'number' ? assetId : parseInt(String(assetId), 10));
    }

    // Commit the transaction
    await transaction.commit();

    const result: BasicUpdateResult = {
      updated: updatedIds,
      count: updatedIds.length,
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
