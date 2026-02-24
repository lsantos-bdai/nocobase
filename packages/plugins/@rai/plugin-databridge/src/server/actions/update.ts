import { Context, Next } from '@nocobase/actions';
import {
  getPlatformBySlugOrThrow,
  lookupAssetIdByName,
  unresolveData,
  RelationNotFoundError,
  ValidationError,
  AssetNotFoundError,
} from '../utils';

interface AssetPayload {
  platform: string;
  collection: string;
  collection_title: string;
  data: Record<string, unknown>;
}

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
 * Update action - updates assets using the same human-readable format as get.
 *
 * Request body: Same structure as get response
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
 * Query parameters:
 * - platform: Platform slug (required)
 */
export async function update(ctx: Context, next: Next) {
  const { platform } = ctx.request.query as { platform?: string };

  if (!platform) {
    ctx.throw(400, 'platform query parameter is required');
  }

  const body = ctx.request.body as Record<string, AssetPayload>;

  if (!body || typeof body !== 'object' || Object.keys(body).length === 0) {
    ctx.throw(400, 'Request body must be a non-empty object with asset payloads');
  }

  // Get platform
  const platformRecord = await getPlatformBySlugOrThrow(ctx, platform);

  const updatedAssets: string[] = [];

  // Use a transaction for ACID guarantees
  const transaction = await ctx.db.sequelize.transaction();

  try {
    for (const [assetName, payload] of Object.entries(body)) {
      const { collection: collectionName, data } = payload;

      // Validate data has an id
      if (data.id === undefined) {
        throw new ValidationError([`Asset '${assetName}' is missing required 'id' field`]);
      }

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
      });

      updatedAssets.push(assetName);
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
