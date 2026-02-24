import { Context, Next } from '@nocobase/actions';
import { getPlatformBySlugOrThrow, resolveCollectionName, lookupAssetIdByName, AssetNotFoundError } from '../utils';

interface DeletePayload {
  assets: string[];
  collection?: string;
}

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
 * Delete action - deletes assets by name.
 *
 * Request body:
 * {
 *   "assets": ["Station 1", "IRS026"]
 * }
 *
 * Or with collection filter:
 * {
 *   "collection": "ArmStation",
 *   "assets": ["Station 1"]
 * }
 *
 * Query parameters:
 * - platform: Platform slug (required)
 */
export async function deleteAssets(ctx: Context, next: Next) {
  const { platform } = ctx.request.query as { platform?: string };

  if (!platform) {
    ctx.throw(400, 'platform query parameter is required');
  }

  const body = ctx.request.body as DeletePayload;

  if (!body || typeof body !== 'object') {
    ctx.throw(400, 'Request body must be an object with assets array');
  }

  const { assets, collection: collectionIdentifier } = body;

  if (!assets || !Array.isArray(assets) || assets.length === 0) {
    ctx.throw(400, 'assets field must be a non-empty array');
  }

  // Get platform
  const platformRecord = await getPlatformBySlugOrThrow(ctx, platform);
  const registeredCollections: string[] = platformRecord.registeredCollections || [];

  // Resolve collection name if provided
  let collectionFilter: string | null = null;
  if (collectionIdentifier) {
    collectionFilter = await resolveCollectionName(ctx, collectionIdentifier, registeredCollections);
    if (!collectionFilter) {
      ctx.throw(404, `Collection '${collectionIdentifier}' not found in platform '${platform}'`);
    }
  }

  const deletedAssets: string[] = [];

  // Use a transaction for ACID guarantees
  const transaction = await ctx.db.sequelize.transaction();

  try {
    // First, verify all assets exist and collect their info
    const assetInfos: { name: string; collection: string; assetId: string }[] = [];

    for (const assetName of assets) {
      const lookupResult = await lookupAssetIdByName(ctx.db, platformRecord, assetName);

      if (!lookupResult) {
        throw new AssetNotFoundError(assetName);
      }

      // If collection filter is specified, verify the asset belongs to that collection
      if (collectionFilter && lookupResult.collection !== collectionFilter) {
        throw new AssetNotFoundError(assetName);
      }

      assetInfos.push({
        name: assetName,
        collection: lookupResult.collection,
        assetId: lookupResult.assetId,
      });
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
        const numericId = parseInt(i.assetId, 10);
        return isNaN(numericId) ? i.assetId : numericId;
      });

      await ctx.db.getRepository(collectionName).destroy({
        filter: { id: { $in: assetIds } },
        transaction,
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

    throw err;
  }

  await next();
}
