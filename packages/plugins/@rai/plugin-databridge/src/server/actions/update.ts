import { Context, Next } from '@nocobase/actions';
import {
  getPlatformBySlugOrThrow,
  lookupAssetIdByName,
  unresolveData,
  validateFieldValues,
  RelationNotFoundError,
  ValidationError,
  AssetNotFoundError,
  validateAssetPayloadMap,
  AssetPayload,
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
 * Update action - updates assets using the unified AssetPayloadMap format.
 *
 * Request body: AssetPayloadMap
 * {
 *   "Station 1": {
 *     "platform": "models",
 *     "collection": "t_98x374ie2j7",
 *     "collection_title": "ArmStation",
 *     "data": {
 *       "id": 1,
 *       "name": "Station 1",
 *       "left_gpu": "WS63",
 *       ...
 *     }
 *   }
 * }
 *
 * The platform is specified per-asset in the payload (no query parameter).
 * Supports multi-platform operations in a single request.
 */
export async function update(ctx: Context, next: Next) {
  const body = ctx.request.body;

  // Validate input using unified schema
  const validation = validateAssetPayloadMap(body, { requireId: true });
  if (!validation.valid) {
    ctx.throw(400, (validation as { valid: false; error: string }).error);
    return;
  }

  // Group assets by platform for efficient processing
  const byPlatform = new Map<string, Array<[string, AssetPayload]>>();
  for (const [assetName, payload] of Object.entries(validation.assets)) {
    const group = byPlatform.get(payload.platform) || [];
    group.push([assetName, payload]);
    byPlatform.set(payload.platform, group);
  }

  const updatedAssets: string[] = [];

  // Use a transaction for ACID guarantees
  const transaction = await ctx.db.sequelize.transaction();

  try {
    // Process each platform group
    for (const [platformSlug, assets] of byPlatform) {
      const platformRecord = await getPlatformBySlugOrThrow(ctx, platformSlug);

      for (const [assetName, payload] of assets) {
        const { collection: collectionName, data } = payload;

        // Verify the asset exists in the platform's lookup table
        const lookupResult = await lookupAssetIdByName(ctx.db, platformRecord, assetName);
        if (!lookupResult) {
          throw new AssetNotFoundError(assetName);
        }

        // Verify collection matches
        if (lookupResult.collection !== collectionName) {
          throw new ValidationError([
            `Asset '${assetName}' belongs to collection '${lookupResult.collection}', not '${collectionName}'`,
          ]);
        }

        // Get the collection
        const collection = ctx.db.getCollection(collectionName);
        if (!collection) {
          throw new ValidationError([`Collection '${collectionName}' not found`]);
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

        // Perform the update
        await ctx.db.getRepository(collectionName).update({
          filterByTk: data.id,
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
