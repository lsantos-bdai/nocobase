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
 */
export interface AssetPayload {
  /** Platform slug (e.g., "models", "inventory") - REQUIRED */
  platform: string;

  /** Internal collection name (e.g., "t_98x374ie2j7") - REQUIRED */
  collection: string;

  /** Human-readable collection title (e.g., "ArmStation") - OPTIONAL for input */
  collection_title?: string;

  /** The record data */
  data: AssetData;
}

/**
 * A map of asset names to their payloads.
 * Keys are human-readable asset names (e.g., "Station 3", "IRS022").
 */
export type AssetPayloadMap = Record<string, AssetPayload>;

/**
 * Options for validating an asset payload map.
 */
export interface ValidateOptions {
  /** Whether data.id is required (for update/delete operations) */
  requireId?: boolean;
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
 * @param body The request body to validate
 * @param options Validation options
 * @returns Validation result with either the typed assets or an error message
 */
export function validateAssetPayloadMap(
  body: unknown,
  options: ValidateOptions = {},
): ValidResult | InvalidResult {
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

    if (!p.platform || typeof p.platform !== 'string') {
      return { valid: false, error: `Asset '${assetName}': 'platform' field is required` };
    }

    if (!p.collection || typeof p.collection !== 'string') {
      return { valid: false, error: `Asset '${assetName}': 'collection' field is required` };
    }

    if (!p.data || typeof p.data !== 'object') {
      return { valid: false, error: `Asset '${assetName}': 'data' field is required` };
    }

    const data = p.data as Record<string, unknown>;

    if (options.requireId && data.id === undefined) {
      return { valid: false, error: `Asset '${assetName}': 'data.id' is required for this operation` };
    }
  }

  return { valid: true, assets: body as AssetPayloadMap };
}
