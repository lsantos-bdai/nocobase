import { Context, Next } from '@nocobase/actions';
import {
  getPlatformBySlugOrThrow,
  lookupAssetIdByName,
  AssetNotFoundError,
  ValidationError,
  validateAssetPayloadList,
  AssetPayload,
  resolveCollection,
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
 * Delete action - deletes assets from a list of AssetPayload objects.
 *
 * Request body: AssetPayload[]
 * [
 *   {
 *     "platform": "models",
 *     "data": { "name": "Station 1" }
 *   },
 *   {
 *     "platform": "inventory",
 *     "data": { "name": "IRS026" }
 *   }
 * ]
 *
 * data.name identifies which asset to delete (looked up in the platform's lookup table).
 * The platform is specified per-asset in the payload (no query parameter).
 * Supports multi-platform operations in a single request.
 */
export async function deleteAssets(ctx: Context, next: Next) {
  const body = ctx.request.body;

  // Validate input: array of payloads, platform + data.name required for delete
  const validation = validateAssetPayloadList(body, { context: 'delete' });
  if (!validation.valid) {
    ctx.throw(400, (validation as { valid: false; error: string }).error);
    return;
  }

  // Group assets by platform for efficient processing
  const byPlatform = new Map<string, AssetPayload[]>();
  for (const payload of validation.assets) {
    const group = byPlatform.get(payload.platform) || [];
    group.push(payload);
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

      for (const payload of assets) {
        const { collection: collectionName, data } = payload;
        // data and data.name are guaranteed present by validateAssetPayloadList
        const assetName = data!.name;

        // Verify the asset exists in the platform's lookup table
        const lookupResult = await lookupAssetIdByName(ctx.db, platformRecord, assetName);
        if (!lookupResult) {
          throw new AssetNotFoundError(assetName);
        }

        // Resolve collection if provided, otherwise use collection from lookup
        const resolvedCollectionName = collectionName
          ? await resolveCollection(ctx, platformRecord, collectionName)
          : lookupResult.collection;

        // Verify collection matches if provided
        if (collectionName && lookupResult.collection !== resolvedCollectionName) {
          throw new ValidationError([
            `Asset '${assetName}' belongs to collection '${lookupResult.collection}', not '${resolvedCollectionName}'`,
          ]);
        }

        // Use the ID from lookup table (data.id is optional override)
        const assetId = data?.id !== undefined ? data.id : lookupResult.assetId;

        assetInfos.push({
          name: assetName,
          collection: resolvedCollectionName,
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
