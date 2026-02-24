import { Context, Next } from '@nocobase/actions';
import {
  getPlatformBySlugOrThrow,
  resolveCollectionName,
  unresolveData,
  validateRequiredFields,
  RelationNotFoundError,
  ValidationError,
} from '../utils';

interface CreatePayload {
  collection: string;
  data: Record<string, unknown> | Record<string, unknown>[];
}

interface CreateResult {
  created: string[];
  count: number;
}

interface CreateError {
  error: string;
  details: {
    asset?: string;
    field?: string;
    value?: string;
    message: string;
  };
}

/**
 * Create action - creates new assets using human-readable format.
 *
 * Request body:
 * {
 *   "collection": "ArmStation",
 *   "data": {
 *     "name": "Station 2",
 *     "left_gpu": "WS63",
 *     "right_gpu": "WS64",
 *     "table_type": "Table"
 *   }
 * }
 *
 * Or batch create:
 * {
 *   "collection": "ArmStation",
 *   "data": [
 *     { "name": "Station 2", "left_gpu": "WS63" },
 *     { "name": "Station 3", "left_gpu": "WS64" }
 *   ]
 * }
 *
 * Query parameters:
 * - platform: Platform slug (required)
 */
export async function create(ctx: Context, next: Next) {
  const { platform } = ctx.request.query as { platform?: string };

  if (!platform) {
    ctx.throw(400, 'platform query parameter is required');
  }

  const body = ctx.request.body as CreatePayload;

  if (!body || typeof body !== 'object') {
    ctx.throw(400, 'Request body must be an object with collection and data fields');
  }

  const { collection: collectionIdentifier, data } = body;

  if (!collectionIdentifier) {
    ctx.throw(400, 'collection field is required');
  }

  if (!data) {
    ctx.throw(400, 'data field is required');
  }

  // Get platform
  const platformRecord = await getPlatformBySlugOrThrow(ctx, platform);
  const registeredCollections: string[] = platformRecord.registeredCollections || [];

  // Resolve collection name (accepts title or internal name)
  const collectionName = await resolveCollectionName(ctx, collectionIdentifier, registeredCollections);

  if (!collectionName) {
    ctx.throw(404, `Collection '${collectionIdentifier}' not found in platform '${platform}'`);
  }

  // Get the collection
  const collection = ctx.db.getCollection(collectionName);
  if (!collection) {
    ctx.throw(404, `Collection '${collectionName}' not found`);
  }

  // Normalize data to array for uniform processing
  const dataArray = Array.isArray(data) ? data : [data];

  if (dataArray.length === 0) {
    ctx.throw(400, 'data must contain at least one record');
  }

  const createdAssets: string[] = [];

  // Use a transaction for ACID guarantees
  const transaction = await ctx.db.sequelize.transaction();

  try {
    for (const itemData of dataArray) {
      // Validate name field is present
      if (!itemData.name || typeof itemData.name !== 'string') {
        throw new ValidationError(['name field is required and must be a string']);
      }

      const assetName = itemData.name as string;

      // Validate required fields
      const requiredErrors = validateRequiredFields(collection, itemData, true);
      if (requiredErrors.length > 0) {
        throw new ValidationError(requiredErrors);
      }

      // Check for duplicate name in platform lookup table
      const existingLookup = await ctx.db.getRepository(platformRecord.collectionName).findOne({
        filter: { name: assetName },
        transaction,
      });

      if (existingLookup) {
        const errorResponse: CreateError = {
          error: 'Duplicate name',
          details: {
            asset: assetName,
            message: `Asset '${assetName}' already exists in platform`,
          },
        };
        ctx.status = 409;
        ctx.body = errorResponse;
        ctx.withoutDataWrapping = true;
        await transaction.rollback();
        return next();
      }

      // Convert human-readable data to internal format
      let internalData: Record<string, unknown>;
      try {
        internalData = await unresolveData(collection, itemData, platformRecord, ctx.db);
      } catch (err) {
        if (err instanceof RelationNotFoundError) {
          const errorResponse: CreateError = {
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

      // Remove id if present (auto-generated)
      delete internalData.id;

      // Perform the create
      await ctx.db.getRepository(collectionName).create({
        values: internalData,
        transaction,
      });

      createdAssets.push(assetName);
    }

    // Commit the transaction
    await transaction.commit();

    const result: CreateResult = {
      created: createdAssets,
      count: createdAssets.length,
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

    // Handle unique constraint violations from DB
    if ((err as any)?.name === 'SequelizeUniqueConstraintError') {
      ctx.status = 409;
      ctx.body = {
        error: 'Duplicate entry',
        details: {
          message: 'A record with this name already exists',
        },
      };
      ctx.withoutDataWrapping = true;
      return next();
    }

    throw err;
  }

  await next();
}
