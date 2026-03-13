import { Context, Next } from '@nocobase/actions';
import {
  getPlatformBySlugOrThrow,
  unresolveData,
  validateRequiredFields,
  validateFieldValues,
  RelationNotFoundError,
  ValidationError,
  validateAssetPayloadList,
  AssetPayload,
  resolveCollection,
  validateBatchSize,
} from '../utils';

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
 * Create action - creates new assets from a list of AssetPayload objects.
 *
 * Request body: AssetPayload[]
 * [
 *   {
 *     "platform": "models",
 *     "collection": "ArmStation",
 *     "data": {
 *       "name": "Station 2",
 *       "left_gpu": "WS63",
 *       "right_gpu": "WS64",
 *       "table_type": "Table"
 *     }
 *   },
 *   {
 *     "platform": "models",
 *     "collection": "RealsenseCamera",
 *     "data": {
 *       "name": "IRS099",
 *       "serial_number": "99999"
 *     }
 *   }
 * ]
 *
 * The platform is specified per-asset in the payload (no query parameter).
 * The id field in data is ignored (auto-generated).
 * Supports multi-platform operations in a single request.
 */
export async function create(ctx: Context, next: Next) {
  const body = ctx.request.body;

  // Validate input: array of payloads, platform + collection + data.name all required for create
  const validation = validateAssetPayloadList(body, { context: 'create' });
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

  const createdAssets: string[] = [];

  // Use a transaction for ACID guarantees
  const transaction = await ctx.db.sequelize.transaction();

  try {
    // Process each platform group
    for (const [platformSlug, assets] of byPlatform) {
      const platformRecord = await getPlatformBySlugOrThrow(ctx, platformSlug);

      for (const payload of assets) {
        // These are guaranteed present by validateAssetPayloadList with context 'create'
        const collectionName = payload.collection!;
        const assetData = payload.data!;
        const assetName = assetData.name;

        // Resolve the collection (supports case-insensitive title matching)
        const resolvedCollectionName = await resolveCollection(ctx, platformRecord, collectionName);

        // Get the collection
        const collection = ctx.db.getCollection(resolvedCollectionName);
        if (!collection) {
          throw new ValidationError([`Collection '${resolvedCollectionName}' not found`]);
        }

        // Validate required fields
        const requiredErrors = validateRequiredFields(collection, assetData, true);

        // Validate field values (types, enums, etc.) using NocoBase Interface system
        const valueErrors = await validateFieldValues(collection, assetData, ctx.db);

        const allErrors = [...requiredErrors, ...valueErrors];
        if (allErrors.length > 0) {
          throw new ValidationError(allErrors);
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
          internalData = await unresolveData(collection, assetData, platformRecord, ctx.db);
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
        await ctx.db.getRepository(resolvedCollectionName).create({
          values: internalData,
          transaction,
          context: ctx, // Pass Koa context so hooks can access currentUser
        });

        createdAssets.push(assetName);
      }
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
