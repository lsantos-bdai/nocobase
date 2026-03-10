/**
 * Unified Asset Payload Schema for Databridge CRUD operations.
 *
 * This schema is used for create, update, and delete inputs and get outputs.
 * All operations accept an AssetPayloadMap where each asset specifies its own platform.
 */

/**
 * The data portion of an asset payload.
 * Contains the record ID (required for update/delete) and field values.
 */
export interface AssetData {
  /** Record ID - REQUIRED for update/delete, auto-generated for create */
  id?: number | string;

  /** Asset name - REQUIRED, must be unique within platform */
  name: string;

  /** Any other fields defined on the collection */
  [field: string]: unknown;
}

/**
 * Payload for a single asset, including its platform and collection context.
 *
 * Field requirements vary by operation (enforced at runtime by validateAssetPayloadMap):
 * - create: platform, collection, and data (with name) are all required
 * - update: platform and data required; collection optional (derived from lookup)
 * - delete: only platform required; collection and data optional (derived from lookup)
 */
export interface AssetPayload {
  /** Platform slug (e.g., "models", "inventory") - REQUIRED for all operations */
  platform: string;

  /** Collection name or title — REQUIRED for create, optional for update/delete (derived from lookup) */
  collection?: string;

  /** Human-readable collection title (e.g., "ArmStation") - OPTIONAL for input */
  collection_title?: string;

  /** The record data — REQUIRED for create/update, optional for delete */
  data?: AssetData;
}

/**
 * A map of asset names to their payloads.
 * Keys are human-readable asset names (e.g., "Station 3", "IRS022").
 */
export type AssetPayloadMap = Record<string, AssetPayload>;

/**
 * Validation context determines which fields are required per operation.
 *
 * - create: requires platform, collection, data (with name)
 * - update: requires platform, data; collection is optional (derived from lookup)
 * - delete: requires platform only; collection and data are optional (derived from lookup)
 */
export type ValidationContext = 'create' | 'update' | 'delete';

/**
 * Options for validating an asset payload map.
 */
export interface ValidateOptions {
  /** Operation context — controls which fields are required */
  context: ValidationContext;
}

/**
 * Validation result when successful.
 */
export interface ValidResult {
  valid: true;
  assets: AssetPayloadMap;
}

/**
 * Validation result when failed.
 */
export interface InvalidResult {
  valid: false;
  error: string;
}

/**
 * Validate an asset payload map.
 *
 * Field requirements by context:
 * - create: platform (required), collection (required), data (required, data.name required)
 * - update: platform (required), collection (optional), data (required)
 * - delete: platform (required), collection (optional), data (optional)
 *
 * @param body The request body to validate
 * @param options Validation options with operation context
 * @returns Validation result with either the typed assets or an error message
 */
export function validateAssetPayloadMap(
  body: unknown,
  options: ValidateOptions,
): ValidResult | InvalidResult {
  const { context } = options;

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, error: 'Request body must be an object mapping asset names to payloads' };
  }

  const entries = Object.entries(body as Record<string, unknown>);
  if (entries.length === 0) {
    return { valid: false, error: 'Request body must contain at least one asset' };
  }

  for (const [assetName, payload] of entries) {
    if (!payload || typeof payload !== 'object') {
      return { valid: false, error: `Asset '${assetName}': payload must be an object` };
    }

    const p = payload as Record<string, unknown>;

    // platform is always required
    if (!p.platform || typeof p.platform !== 'string') {
      return { valid: false, error: `Asset '${assetName}': 'platform' field is required` };
    }

    // collection: required for create, optional for update/delete
    if (context === 'create') {
      if (!p.collection || typeof p.collection !== 'string') {
        return { valid: false, error: `Asset '${assetName}': 'collection' field is required for create` };
      }
    } else if (p.collection !== undefined && typeof p.collection !== 'string') {
      return { valid: false, error: `Asset '${assetName}': 'collection' must be a string when provided` };
    }

    // data: required for create/update, optional for delete
    if (context === 'create' || context === 'update') {
      if (!p.data || typeof p.data !== 'object') {
        return { valid: false, error: `Asset '${assetName}': 'data' field is required for ${context}` };
      }
    } else if (p.data !== undefined && typeof p.data !== 'object') {
      return { valid: false, error: `Asset '${assetName}': 'data' must be an object when provided` };
    }

    // data.name: required for create only
    if (context === 'create' && p.data) {
      const data = p.data as Record<string, unknown>;
      if (!data.name || typeof data.name !== 'string') {
        return { valid: false, error: `Asset '${assetName}': 'data.name' is required for create` };
      }
    }
  }

  return { valid: true, assets: body as AssetPayloadMap };
}
