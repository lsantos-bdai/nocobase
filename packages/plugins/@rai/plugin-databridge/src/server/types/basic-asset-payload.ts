/**
 * Types and validation for the databridgeBasic resource.
 *
 * Unlike the platform-scoped AssetPayload, BasicAssetPayload has no platform field.
 * Assets are identified by collection + data.id for mutations.
 * Relation fields are represented as RelationDescriptor objects in responses.
 */

/**
 * Describes a relation field value in a BasicAssetPayload response.
 * The `id` array always contains one or more IDs — even for belongsTo (single-value) relations.
 * The `name` array contains the name of each related record when the target collection has a name field.
 */
export interface RelationDescriptor {
  /** Internal collection name of the related table */
  collection: string;

  /** Human-readable title of the related table */
  collection_title: string;

  /** ID(s) of the related record(s). Always an array. */
  id: (number | string)[];

  /** Name(s) of the related record(s), when available. Empty array if target has no name field. */
  name: string[];
}

/**
 * Payload for a single asset in the basic (platform-free) API.
 *
 * Field requirements vary by operation:
 * - get/search (response): collection, collection_title, and data are present
 * - bulkCreate: collection and data required; data.id is ignored (auto-generated)
 * - bulkUpdate: collection and data (with id) required
 * - bulkDelete: collection and data (with id) required
 */
export interface BasicAssetPayload {
  /** Collection name or title — always required */
  collection: string;

  /** Human-readable collection title — present in responses, ignored in requests */
  collection_title?: string;

  /** The record data. Relation fields are RelationDescriptor objects in responses. */
  data: Record<string, unknown>;
}

/**
 * Validation context for basic asset payloads.
 */
export type BasicValidationContext = 'create' | 'update' | 'delete';

/**
 * Validation result types.
 */
export interface ValidBasicListResult {
  valid: true;
  assets: BasicAssetPayload[];
}

export interface InvalidBasicResult {
  valid: false;
  error: string;
}

/**
 * Validate a basic asset payload list for mutation operations.
 *
 * Rules:
 * - Body must be a non-empty array of objects
 * - collection: always required (string)
 * - data: always required (object)
 * - data.id: required for update and delete (number or string)
 * - data.id: ignored for create
 */
export function validateBasicAssetPayloadList(
  body: unknown,
  options: { context: BasicValidationContext },
): ValidBasicListResult | InvalidBasicResult {
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

    // collection is always required
    if (!p.collection || typeof p.collection !== 'string') {
      return { valid: false, error: `${label}: 'collection' field is required` };
    }

    // data is always required
    if (!p.data || typeof p.data !== 'object' || Array.isArray(p.data)) {
      return { valid: false, error: `${label}: 'data' field is required` };
    }

    // data.id is required for update and delete
    if (context === 'update' || context === 'delete') {
      const data = p.data as Record<string, unknown>;
      if (data.id === undefined || data.id === null) {
        return { valid: false, error: `${label}: 'data.id' is required for ${context}` };
      }
    }
  }

  return { valid: true, assets: body as BasicAssetPayload[] };
}
