import { Context, Next } from '@nocobase/actions';
import {
  getPlatformBySlugOrThrow,
  lookupAssetIdByName,
  AssetNotFoundError,
  ValidationError,
  validateAssetPayloadMap,
  AssetPayload,
} from '../utils';

interface DeleteResult {
  deleted: string[];
  count: number;
}

interface DeleteError {
  error: string;
  details: {
    asset: string;
    message: string;
  };
}

/**
 * Delete action - deletes assets using the unified AssetPayloadMap format.
 *
 * Request body: AssetPayloadMap
 * {
 *   "Station 1": {
 *     "platform": "models",
 *     "collection": "t_98x374ie2j7",
 *     "data": {
 *       "id": 1,
 *       "name": "Station 1"
 *     }
 *   },
 *   "IRS026": {
 *     "platform": "inventory",
 *     "collection": "t_abc123",
 *     "data": {
 *       "id": 42,
 *       "name": "IRS026"
 *     }
 *   }
 * }
 *
 * The platform is specified per-asset in the payload (no query parameter).
 * Only platform, collection, and data.id (or data.name for lookup) are required.
 * Supports multi-platform operations in a single request.
 */
export async function deleteAssets(ctx: Context, next: Next) {
  const body = ctx.request.body;

  // Validate input using unified schema
  // Note: We allow either id OR name for deletion (name is used for lookup if no id)
  const validation = validateAssetPayloadMap(body, { requireId: false });
  if (!validation.valid) {
    ctx.throw(400, validation.error);
  }

  // Group assets by platform for efficient processing
  const byPlatform = new Map<string, Array<[string, AssetPayload]>>();
  for (const [assetName, payload] of Object.entries(validation.assets)) {
    const group = byPlatform.get(payload.platform) || [];
    group.push([assetName, payload]);
    byPlatform.set(payload.platform, group);
  }

  const deletedAssets: string[] = [];

  // Use a transaction for ACID guarantees
  const transaction = await ctx.db.sequelize.transaction();

  try {
    // First pass: verify all assets exist and collect their info
    const assetInfos: Array<{
      name: string;
      collection: string;
      assetId: string | number;
      platformSlug: string;
    }> = [];

    for (const [platformSlug, assets] of byPlatform) {
      const platformRecord = await getPlatformBySlugOrThrow(ctx, platformSlug);

      for (const [assetName, payload] of assets) {
        const { collection: collectionName, data } = payload;

        // Verify the asset exists in the platform's lookup table
        const lookupResult = await lookupAssetIdByName(ctx.db, platformRecord, assetName);
        if (!lookupResult) {
          throw new AssetNotFoundError(assetName);
        }

        // Verify collection matches if provided
        if (lookupResult.collection !== collectionName) {
          throw new ValidationError([
            `Asset '${assetName}' belongs to collection '${lookupResult.collection}', not '${collectionName}'`,
          ]);
        }

        // Use the ID from data if provided, otherwise use the looked-up ID
        const assetId = data.id !== undefined ? data.id : lookupResult.assetId;

        assetInfos.push({
          name: assetName,
          collection: collectionName,
          assetId,
          platformSlug,
        });
      }
    }

    // Group by collection for efficient deletion
    const byCollection = new Map<string, typeof assetInfos>();
    for (const info of assetInfos) {
      if (!byCollection.has(info.collection)) {
        byCollection.set(info.collection, []);
      }
      byCollection.get(info.collection)!.push(info);
    }

    // Delete from each collection
    for (const [collectionName, infos] of byCollection) {
      const assetIds = infos.map((i) => {
        if (typeof i.assetId === 'number') return i.assetId;
        const numericId = parseInt(String(i.assetId), 10);
        return isNaN(numericId) ? i.assetId : numericId;
      });

      await ctx.db.getRepository(collectionName).destroy({
        filter: { id: { $in: assetIds } },
        transaction,
        context: ctx, // Pass Koa context so hooks can access currentUser
      });

      for (const info of infos) {
        deletedAssets.push(info.name);
      }
    }

    // Commit the transaction
    await transaction.commit();

    const result: DeleteResult = {
      deleted: deletedAssets,
      count: deletedAssets.length,
    };

    ctx.body = result;
    ctx.withoutDataWrapping = true;
  } catch (err) {
    await transaction.rollback();

    if (err instanceof AssetNotFoundError) {
      const errorResponse: DeleteError = {
        error: 'Asset not found',
        details: {
          asset: err.assetName,
          message: err.message,
        },
      };
      ctx.status = 404;
      ctx.body = errorResponse;
      ctx.withoutDataWrapping = true;
      return next();
    }

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

    throw err;
  }

  await next();
}
