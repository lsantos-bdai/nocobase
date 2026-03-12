import { Context, Next } from '@nocobase/actions';
import {
  validateBasicAssetPayloadList,
  BasicAssetPayload,
} from '../../types/basic-asset-payload';
import { resolveCollectionBasic } from '../../utils/resolve-collection-basic';
import { unresolveDataBasic } from '../../utils/fetch-assets-basic';
import {
  validateRequiredFields,
  validateFieldValues,
  ValidationError,
} from '../../utils/field-mapping';

interface BasicCreateResult {
  created: number[];
  count: number;
}

/**
 * Bulk create action for databridgeBasic (platform-free).
 *
 * Request body: list[BasicAssetPayload]
 * - collection: required (name or title)
 * - data: required (free-form object)
 * - data.id: ignored (auto-generated)
 *
 * Response: { created: number[], count: number }
 * All operations are ACID — entire batch succeeds or fails atomically.
 */
export async function basicCreate(ctx: Context, next: Next) {
  const body = ctx.request.body;

  // Validate input
  const validation = validateBasicAssetPayloadList(body, { context: 'create' });
  if (!validation.valid) {
    ctx.throw(400, (validation as { valid: false; error: string }).error);
    return;
  }

  const assets = validation.assets as BasicAssetPayload[];
  const createdIds: number[] = [];

  // Use a transaction for ACID guarantees
  const transaction = await ctx.db.sequelize.transaction();

  try {
    for (const payload of assets) {
      // Resolve collection (case-insensitive title match)
      const collectionName = await resolveCollectionBasic(ctx, ctx.db, payload.collection);

      const collection = ctx.db.getCollection(collectionName);
      if (!collection) {
        throw new ValidationError([`Collection '${collectionName}' not found`]);
      }

      // Validate required fields
      const requiredErrors = validateRequiredFields(collection, payload.data, true);

      // Validate field values (types, enums, etc.)
      const valueErrors = await validateFieldValues(collection, payload.data, ctx.db);

      const allErrors = [...requiredErrors, ...valueErrors];
      if (allErrors.length > 0) {
        throw new ValidationError(allErrors);
      }

      // Convert human-readable data to internal format
      const internalData = await unresolveDataBasic(collection, payload.data);

      // Remove id if present (auto-generated)
      delete internalData.id;

      // Perform the create
      const created = await ctx.db.getRepository(collectionName).create({
        values: internalData,
        transaction,
        context: ctx,
      });

      createdIds.push(created.id as number);
    }

    // Commit the transaction
    await transaction.commit();

    const result: BasicCreateResult = {
      created: createdIds,
      count: createdIds.length,
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
          message: 'A record with this value already exists',
        },
      };
      ctx.withoutDataWrapping = true;
      return next();
    }

    throw err;
  }

  await next();
}
