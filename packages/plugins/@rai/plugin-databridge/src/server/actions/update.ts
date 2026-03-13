import { Context, Next } from '@nocobase/actions';
import {
  getPlatformBySlugOrThrow,
  lookupAssetIdByName,
  unresolveData,
  validateFieldValues,
  RelationNotFoundError,
  ValidationError,
  AssetNotFoundError,
  validateAssetPayloadList,
  AssetPayload,
  resolveCollection,
  validateBatchSize,
} from '../utils';

interface UpdateResult {
  updated: string[];
  count: number;
}

interface UpdateError {
  error: string;
  details: {
    asset: string;
    field?: string;
    value?: string;
    message: string;
  };
}

/**
 * Update action - updates assets from a list of AssetPayload objects.
 *
 * Request body: AssetPayload[]
 * [
 *   {
 *     "platform": "models",
 *     "data": {
 *       "name": "Station 1",
 *       "left_gpu": "WS63"
 *     }
 *   }
 * ]
 *
 * data.name identifies which asset to update (looked up in the platform's lookup table).
 * The platform is specified per-asset in the payload (no query parameter).
 * Supports multi-platform operations in a single request.
 */
export async function update(ctx: Context, next: Next) {
  const body = ctx.request.body;

  // Validate input: array of payloads, platform + data.name required for update
  const validation = validateAssetPayloadList(body, { context: 'update' });
  if (!validation.valid) {
    ctx.throw(400, (validation as { valid: false; error: string }).error);
    return;
  }

  // Enforce batch size limit
  validateBatchSize(ctx, validation.assets);

  // Group assets by platform for efficient processing
  const byPlatform = new Map<string, AssetPayload[]>();
  for (const payload of validation.assets) {
    const group = byPlatform.get(payload.platform) || [];
    group.push(payload);
    byPlatform.set(payload.platform, group);
  }

  const updatedAssets: string[] = [];

  // Use a transaction for ACID guarantees
  const transaction = await ctx.db.sequelize.transaction();

  try {
    // Process each platform group
    for (const [platformSlug, assets] of byPlatform) {
      const platformRecord = await getPlatformBySlugOrThrow(ctx, platformSlug);

      for (const payload of assets) {
        const { collection: collectionName } = payload;
        // data and data.name are guaranteed present by validateAssetPayloadList
        const data = payload.data!;
        const assetName = data.name;

        // Verify the asset exists in the platform's lookup table
        const lookupResult = await lookupAssetIdByName(ctx.db, platformRecord, assetName);
        if (!lookupResult) {
          throw new AssetNotFoundError(assetName);
        }

        // Resolve collection if provided, otherwise use collection from lookup
        const resolvedCollectionName = collectionName
          ? await resolveCollection(ctx, platformRecord, collectionName)
          : lookupResult.collection;

        // Verify collection matches lookup
        if (collectionName && lookupResult.collection !== resolvedCollectionName) {
          throw new ValidationError([
            `Asset '${assetName}' belongs to collection '${lookupResult.collection}', not '${resolvedCollectionName}'`,
          ]);
        }

        // Get the collection
        const collection = ctx.db.getCollection(resolvedCollectionName);
        if (!collection) {
          throw new ValidationError([`Collection '${resolvedCollectionName}' not found`]);
        }

        // Validate field values (types, enums, etc.) using NocoBase Interface system
        const valueErrors = await validateFieldValues(collection, data, ctx.db);
        if (valueErrors.length > 0) {
          throw new ValidationError(valueErrors);
        }

        // Convert human-readable data to internal format
        let internalData: Record<string, unknown>;
        try {
          internalData = await unresolveData(collection, data, platformRecord, ctx.db);
        } catch (err) {
          if (err instanceof RelationNotFoundError) {
            const errorResponse: UpdateError = {
              error: 'Relation not found',
              details: {
                asset: assetName,
                field: err.field,
                value: err.value,
                message: err.message,
              },
            };
            ctx.status = 422;
            ctx.body = errorResponse;
            ctx.withoutDataWrapping = true;
            await transaction.rollback();
            return next();
          }
          throw err;
        }

        // Remove 'id' from update values (it's for identifying, not updating)
        const { id, ...updateValues } = internalData;

        // Perform the update using assetId from lookup table
        await ctx.db.getRepository(resolvedCollectionName).update({
          filterByTk: lookupResult.assetId,
          values: updateValues,
          transaction,
          context: ctx, // Pass Koa context so hooks can access currentUser
        });

        updatedAssets.push(assetName);
      }
    }

    // Commit the transaction
    await transaction.commit();

    const result: UpdateResult = {
      updated: updatedAssets,
      count: updatedAssets.length,
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
          asset: '',
          message: err.errors.join(', '),
        },
      };
      ctx.withoutDataWrapping = true;
      return next();
    }

    if (err instanceof AssetNotFoundError) {
      ctx.status = 404;
      ctx.body = {
        error: 'Asset not found',
        details: {
          asset: err.assetName,
          message: err.message,
        },
      };
      ctx.withoutDataWrapping = true;
      return next();
    }

    throw err;
  }

  await next();
}
