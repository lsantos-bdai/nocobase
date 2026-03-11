/**
 * Unified Asset Payload Schema for Databridge CRUD operations.
 *
 * - Responses (get/search) use AssetPayloadMap (dict keyed by asset name for O(1) lookup).
 * - Mutation inputs (create/update/delete) use AssetPayload[] (list).
 *   The asset name is always sourced from data.name — dict keys are never used as identifiers.
 */

/**
 * The data portion of an asset payload.
 * Contains the record ID (auto-generated) and field values.
 */
export interface AssetData {
  /** Record ID - auto-generated, ignored on create */
  id?: number | string;

  /** Asset name - REQUIRED for all mutation operations, must be unique within platform */
  name: string;

  /** Any other fields defined on the collection */
  [field: string]: unknown;
}

/**
 * Payload for a single asset, including its platform and collection context.
 *
 * Field requirements vary by operation (enforced at runtime by validateAssetPayloadList):
 * - create: platform, collection, and data (with name) are all required
 * - update: platform and data (with name) required; collection optional (derived from lookup)
 * - delete: platform and data (with name) required; collection optional (derived from lookup)
 */
export interface AssetPayload {
  /** Platform slug (e.g., "models", "inventory") - REQUIRED for all operations */
  platform: string;

  /** Collection name or title — REQUIRED for create, optional for update/delete (derived from lookup) */
  collection?: string;

  /** Human-readable collection title (e.g., "ArmStation") - present in responses, ignored in requests */
  collection_title?: string;

  /** The record data — REQUIRED for all mutation operations */
  data?: AssetData;
}

/**
 * A map of asset names to their payloads.
 * Keys are human-readable asset names (e.g., "Station 3", "IRS022").
 * Used for GET/SEARCH responses — provides O(1) lookup by name.
 */
export type AssetPayloadMap = Record<string, AssetPayload>;

/**
 * Validation context determines which fields are required per operation.
 *
 * - create: requires platform, collection, data (with name)
 * - update: requires platform, data (with name); collection is optional
 * - delete: requires platform, data (with name); collection is optional
 */
export type ValidationContext = 'create' | 'update' | 'delete';

/**
 * Options for validating an asset payload list.
 */
export interface ValidateOptions {
  /** Operation context — controls which fields are required */
  context: ValidationContext;
}

/**
 * Validation result when successful.
 */
export interface ValidListResult {
  valid: true;
  assets: AssetPayload[];
}

/**
 * Validation result when failed.
 */
export interface InvalidResult {
  valid: false;
  error: string;
}

/**
 * Validate an asset payload list for mutation operations (create/update/delete).
 *
 * Field requirements by context:
 * - create: platform (required), collection (required), data (required), data.name (required)
 * - update: platform (required), collection (optional), data (required), data.name (required)
 * - delete: platform (required), collection (optional), data (required), data.name (required)
 *
 * @param body The request body to validate (must be an array of AssetPayload)
 * @param options Validation options with operation context
 * @returns Validation result with either the typed assets or an error message
 */
export function validateAssetPayloadList(
  body: unknown,
  options: ValidateOptions,
): ValidListResult | InvalidResult {
  const { context } = options;

  if (!body || !Array.isArray(body)) {
    return { valid: false, error: 'Request body must be an array of asset payloads' };
  }

  if (body.length === 0) {
    return { valid: false, error: 'Request body must contain at least one asset payload' };
  }

  for (let i = 0; i < body.length; i++) {
    const payload = body[i];
    const label = `Payload[${i}]`;

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return { valid: false, error: `${label}: must be an object` };
    }

    const p = payload as Record<string, unknown>;

    // platform is always required
    if (!p.platform || typeof p.platform !== 'string') {
      return { valid: false, error: `${label}: 'platform' field is required` };
    }

    // collection: required for create, optional for update/delete
    if (context === 'create') {
      if (!p.collection || typeof p.collection !== 'string') {
        return { valid: false, error: `${label}: 'collection' field is required for create` };
      }
    } else if (p.collection !== undefined && typeof p.collection !== 'string') {
      return { valid: false, error: `${label}: 'collection' must be a string when provided` };
    }

    // data is required for all mutation operations
    if (!p.data || typeof p.data !== 'object' || Array.isArray(p.data)) {
      return { valid: false, error: `${label}: 'data' field is required` };
    }

    // data.name is required for all mutation operations
    const data = p.data as Record<string, unknown>;
    if (!data.name || typeof data.name !== 'string') {
      return { valid: false, error: `${label}: 'data.name' is required` };
    }
  }

  return { valid: true, assets: body as AssetPayload[] };
}
