/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

export default {
  info: {
    title: 'NocoBase API - Databridge plugin',
  },
  tags: [
    { name: 'databridge', description: 'Asset CRUD operations (get, search, bulkCreate, bulkUpdate, bulkDelete)' },
    { name: 'databridgeBasic', description: 'Platform-free collection-level CRUD, search, and schema-conformant export' },
    { name: 'databridge_platforms', description: 'Platform management' },
  ],
  components: {
    schemas: {
      AssetData: {
        type: 'object',
        additionalProperties: true,
        description:
          'Asset data as a flat key-value object. The `name` field (string) is required for all mutation operations and must be unique within the platform. All collection fields are top-level properties — the shape depends on the collection schema.',
      },
      AssetPayload: {
        type: 'object',
        properties: {
          platform: {
            type: 'string',
            description: 'Platform slug (e.g., "models", "inventory") — REQUIRED for all operations.',
            example: 'models',
          },
          collection: {
            type: 'string',
            description:
              'Collection name or title. Accepts the internal name (e.g., "t_98x374ie2j7") or the human-readable title (e.g., "ArmStation") — matching is case-insensitive. REQUIRED for create. Optional for update/delete (derived from the platform lookup table). Returns 409 if the title matches multiple collections within the platform.',
            example: 'ArmStation',
          },
          collection_title: {
            type: 'string',
            description: 'Human-readable collection title — present in responses, ignored in requests.',
            example: 'ArmStation',
          },
          data: {
            $ref: '#/components/schemas/AssetData',
            description: 'Asset data — REQUIRED for all mutation operations.',
          },
        },
        required: ['platform', 'data'],
        description:
          'Payload for a single asset. Field requirements vary by operation:\n- **bulkCreate**: `platform`, `collection`, and `data` (with `name`) are all required.\n- **bulkUpdate**: `platform` and `data` (with `name`) required; `collection` is optional (derived from lookup).\n- **bulkDelete**: `platform` and `data` (with `name`) required; `collection` is optional (derived from lookup).',
      },
      AssetPayloadMap: {
        type: 'object',
        additionalProperties: {
          $ref: '#/components/schemas/AssetPayload',
        },
        description: 'A map of asset names to their payloads. Keys are human-readable asset names.',
        example: {
          'Station 3': {
            platform: 'models',
            collection: 'ArmStation',
            data: {
              id: 3,
              name: 'Station 3',
              table_type: 'Table',
              left_gpu: 'WS39',
              right_gpu: 'WS39',
            },
          },
          IRS022: {
            platform: 'models',
            collection: 'RealsenseCamera',
            data: {
              id: 42,
              name: 'IRS022',
              serial_number: '12345678',
            },
          },
        },
      },
      BulkOperationResponse: {
        type: 'object',
        properties: {
          created: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of created asset names (for bulkCreate)',
          },
          updated: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of updated asset names (for bulkUpdate)',
          },
          deleted: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of deleted asset names (for bulkDelete)',
          },
          count: {
            type: 'integer',
            description: 'Number of assets affected',
          },
        },
      },
      ValidationErrorResponse: {
        type: 'object',
        properties: {
          error: { type: 'string', description: 'Error type' },
          details: {
            type: 'object',
            properties: {
              asset: { type: 'string', description: 'Asset that caused the error' },
              field: { type: 'string', description: 'Field that caused the error' },
              value: { type: 'string', description: 'Invalid value' },
              message: { type: 'string', description: 'Error message' },
            },
          },
        },
      },
      RelationDescriptor: {
        type: 'object',
        properties: {
          collection: { type: 'string', description: 'Internal collection name of the related table' },
          collection_title: { type: 'string', description: 'Human-readable title of the related table' },
          id: {
            type: 'array',
            items: { oneOf: [{ type: 'integer' }, { type: 'string' }] },
            description: 'ID(s) of the related record(s). Always an array, even for belongsTo.',
          },
          name: {
            type: 'array',
            items: { type: 'string' },
            description: 'Name(s) of the related record(s), when the target collection has a name field. Empty array otherwise.',
          },
        },
        required: ['collection', 'collection_title', 'id', 'name'],
        example: {
          collection: 't_ta7jaqy245a',
          collection_title: 'FrankaResearch3',
          id: [25],
          name: ['Amber'],
        },
      },
      BasicAssetData: {
        type: 'object',
        additionalProperties: true,
        description:
          'Asset data as a flat key-value object. Relation fields are represented as RelationDescriptor objects in responses. For mutations, relation values must be raw FK IDs.',
      },
      BasicAssetPayload: {
        type: 'object',
        properties: {
          collection: {
            type: 'string',
            description:
              'Collection name or title. Accepts internal name (e.g., "t_98x374ie2j7") or human-readable title (e.g., "ArmStation") — matching is case-insensitive. Returns 409 if ambiguous.',
            example: 'ArmStation',
          },
          collection_title: {
            type: 'string',
            description: 'Human-readable collection title — present in responses, ignored in requests.',
            example: 'ArmStation',
          },
          data: {
            $ref: '#/components/schemas/BasicAssetData',
            description: 'Asset data. Relation fields are RelationDescriptor objects in responses.',
          },
        },
        required: ['collection', 'data'],
        description:
          'Payload for a single asset in the basic (platform-free) API.\n- **get/search** (response): collection, collection_title, and data are present.\n- **bulkCreate**: collection and data required; data.id is ignored.\n- **bulkUpdate/bulkDelete**: collection and data (with id) required.',
      },
      BasicBulkOperationResponse: {
        type: 'object',
        properties: {
          created: {
            type: 'array',
            items: { type: 'integer' },
            description: 'List of created record IDs (for bulkCreate)',
          },
          updated: {
            type: 'array',
            items: { type: 'integer' },
            description: 'List of updated record IDs (for bulkUpdate)',
          },
          deleted: {
            type: 'array',
            items: { type: 'integer' },
            description: 'List of deleted record IDs (for bulkDelete)',
          },
          count: {
            type: 'integer',
            description: 'Number of records affected',
          },
        },
      },
      BasicListResponse: {
        type: 'object',
        properties: {
          data: {
            type: 'array',
            items: { $ref: '#/components/schemas/BasicAssetPayload' },
            description: 'Page of BasicAssetPayload items',
          },
          meta: {
            type: 'object',
            properties: {
              page: { type: 'integer', description: 'Current page number (1-indexed)' },
              pageSize: { type: 'integer', description: 'Items per page' },
              count: { type: 'integer', description: 'Total number of matching records' },
              totalPage: { type: 'integer', description: 'Total number of pages' },
            },
            required: ['page', 'pageSize', 'count', 'totalPage'],
          },
        },
        required: ['data', 'meta'],
        description: 'Paginated list response with BasicAssetPayload items and pagination metadata.',
      },
    },
  },
  paths: {
    '/databridge:get': {
      get: {
        operationId: 'getAssets',
        tags: ['databridge'],
        summary: 'Get assets by platform and name(s)',
        description:
          'Get one or more assets by name. Returns data in AssetPayloadMap format. Supports relation traversal to recursively fetch related assets.',
        parameters: [
          {
            name: 'platform',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'Platform slug',
          },
          {
            name: 'asset_name',
            in: 'query',
            required: true,
            schema: {
              type: 'array',
              items: { type: 'string' },
            },
            description: 'Asset name(s) to look up. Can be a single name or multiple names.',
          },
          {
            name: 'get_relations',
            in: 'query',
            required: false,
            schema: { type: 'boolean', default: false },
            description: 'If true, recursively fetch related assets registered in the same platform.',
          },
          {
            name: 'relation_depth',
            in: 'query',
            required: false,
            schema: { type: 'integer', default: 1, minimum: 0 },
            description:
              'How deep to traverse relations (only used when get_relations=true). 1 = direct relations only.',
          },
        ],
        responses: {
          200: {
            description: 'Assets found (AssetPayloadMap format)',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AssetPayloadMap' },
              },
            },
          },
          400: { description: 'Missing required parameters' },
        },
      },
    },
    '/databridge:getSchemaConformant': {
      get: {
        operationId: 'getSchemaConformant',
        tags: ['databridge'],
        summary: 'Get assets in schema-conformant format with $schema URLs',
        description:
          'Get one or more assets and return them as a flat array of data objects, each with a `$schema` property pointing to the GCS-hosted schema YAML for the asset\'s collection. The `env` parameter selects the GCS bucket (prod vs dev). Supports relation traversal.',
        parameters: [
          {
            name: 'platform',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'Platform slug',
          },
          {
            name: 'asset_name',
            in: 'query',
            required: true,
            schema: {
              type: 'array',
              items: { type: 'string' },
            },
            description: 'Asset name(s) to look up. Can be a single name or multiple names.',
          },
          {
            name: 'env',
            in: 'query',
            required: true,
            schema: { type: 'string', enum: ['prod', 'dev'] },
            description: 'Schema environment. Selects which GCS bucket to use for $schema URLs.',
          },
          {
            name: 'get_relations',
            in: 'query',
            required: false,
            schema: { type: 'boolean', default: false },
            description: 'If true, recursively fetch related assets registered in the same platform.',
          },
          {
            name: 'relation_depth',
            in: 'query',
            required: false,
            schema: { type: 'integer', default: 1, minimum: 0 },
            description:
              'How deep to traverse relations (only used when get_relations=true). 1 = direct relations only.',
          },
        ],
        responses: {
          200: {
            description: 'Schema-conformant asset data array',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      $schema: {
                        type: 'string',
                        description: 'URL to the GCS-hosted schema YAML for this asset\'s collection',
                        example:
                          'https://storage.cloud.google.com/schema-management-proj-mle-396318/bdai/ingestion/ArmStation/latest/spec/ArmStation.yaml',
                      },
                    },
                    additionalProperties: true,
                    description:
                      'Asset data with all collection fields as top-level properties, plus a $schema URL.',
                  },
                },
                example: [
                  {
                    $schema:
                      'https://storage.cloud.google.com/schema-management-proj-mle-396318/bdai/ingestion/ArmStation/latest/spec/ArmStation.yaml',
                    id: 3,
                    name: 'Station 3',
                    table_type: 'Table',
                    left_gpu: 'WS39',
                    right_gpu: 'WS39',
                  },
                ],
              },
            },
          },
          400: { description: 'Missing required parameters or invalid env value' },
        },
      },
    },
    '/databridge:search': {
      get: {
        operationId: 'searchAssets',
        tags: ['databridge'],
        summary: 'Search assets across collections',
        description:
          'Search for assets across all collections (or a specific collection) in a platform. Performs case-insensitive substring matching across text fields and relation name fields.',
        parameters: [
          {
            name: 'platform',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'Platform slug',
          },
          {
            name: 'q',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'Search term (case-insensitive substring match)',
          },
          {
            name: 'collection',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description:
              'Limit search to a specific collection. Accepts internal name (e.g., "t_98x374ie2j7") or human-readable title (e.g., "ArmStation") — matching is case-insensitive. Returns 409 if the title matches multiple collections within the platform.',
          },
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', default: 10, maximum: 100 },
            description: 'Maximum number of results to return (default: 10, max: 100)',
          },
          {
            name: 'propertySearch',
            in: 'query',
            required: false,
            schema: { type: 'boolean', default: false },
            description:
              'If true, search across all text fields and relations. If false (default), only search asset names.',
          },
        ],
        responses: {
          200: {
            description: 'Search results (AssetPayloadMap format)',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AssetPayloadMap' },
              },
            },
          },
          400: { description: 'Missing required parameters' },
          404: { description: 'Platform or collection not found' },
          409: { description: 'Ambiguous collection title — matches multiple collections within the platform' },
        },
      },
    },
    '/databridge:list': {
      get: {
        operationId: 'listCollections',
        tags: ['databridge'],
        summary: 'List collections in a platform',
        description: 'Returns a list of all collections registered in a platform with their names and titles.',
        parameters: [
          {
            name: 'platform',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'Platform slug',
          },
        ],
        responses: {
          200: {
            description: 'List of collections',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string', description: 'Internal collection name' },
                      title: { type: 'string', description: 'Human-readable collection title' },
                    },
                  },
                },
              },
            },
          },
          400: { description: 'Missing required parameters' },
          404: { description: 'Platform not found' },
        },
      },
    },
    '/databridge:index': {
      get: {
        operationId: 'indexAssets',
        tags: ['databridge'],
        summary: 'Index all asset names by collection',
        description:
          'Returns a dictionary where each key is a collection title and the value is a list of all asset names in that collection.',
        parameters: [
          {
            name: 'platform',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'Platform slug',
          },
        ],
        responses: {
          200: {
            description: 'Asset names indexed by collection',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'List of asset names in this collection',
                  },
                },
              },
            },
          },
          400: { description: 'Missing required parameters' },
          404: { description: 'Platform not found' },
        },
      },
    },
    '/databridge:bulkUpdate': {
      post: {
        operationId: 'bulkUpdate',
        tags: ['databridge'],
        summary: 'Bulk update assets using a list of AssetPayload objects',
        description:
          'Update one or more assets. The request body is an array of AssetPayload objects. Each asset is identified by `data.name` (looked up in the platform\'s lookup table).\n\nThe `collection` field is optional — if omitted, the collection is derived from the platform lookup table. When provided, it accepts an internal name or human-readable title (case-insensitive). Returns 409 if the title matches multiple collections.\n\nThe `data.id` field is not required — the record is identified by `data.name` via the platform lookup table.\n\nAll operations are ACID — the entire batch succeeds or fails atomically.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: { $ref: '#/components/schemas/AssetPayload' },
              },
              example: [
                {
                  platform: 'models',
                  collection: 'ArmStation',
                  data: {
                    name: 'Station 1',
                    left_gpu: 'WS63',
                    right_gpu: 'WS64',
                  },
                },
                {
                  platform: 'inventory',
                  data: {
                    name: 'IRS026',
                    serial_number: '999999',
                  },
                },
              ],
            },
          },
        },
        responses: {
          200: {
            description: 'Assets updated successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    updated: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Names of updated assets',
                    },
                    count: { type: 'integer', description: 'Number of assets updated' },
                  },
                },
                example: {
                  updated: ['Station 1', 'IRS026'],
                  count: 2,
                },
              },
            },
          },
          400: { description: 'Invalid request format' },
          404: { description: 'Platform or asset not found' },
          422: {
            description: 'Validation failed (relation not found, type mismatch, collection mismatch, etc.)',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
              },
            },
          },
          409: { description: 'Ambiguous collection title — matches multiple collections within the platform' },
        },
      },
    },
    '/databridge:bulkCreate': {
      post: {
        operationId: 'bulkCreate',
        tags: ['databridge'],
        summary: 'Bulk create assets using a list of AssetPayload objects',
        description:
          'Create one or more assets. The request body is an array of AssetPayload objects. The platform is specified per-asset in the payload (no query parameter). Supports multi-platform operations in a single request.\n\nThe `collection` field is required and accepts an internal name or human-readable title (case-insensitive). Returns 409 if the title matches multiple collections within the platform.\n\nThe `id` field in data is ignored (auto-generated). The `data.name` field is required and must be unique within the platform. All operations are ACID — the entire batch succeeds or fails atomically.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: { $ref: '#/components/schemas/AssetPayload' },
              },
              example: [
                {
                  platform: 'models',
                  collection: 'ArmStation',
                  data: {
                    name: 'Station 2',
                    left_gpu: 'WS63',
                    right_gpu: 'WS64',
                    table_type: 'Table',
                  },
                },
                {
                  platform: 'models',
                  collection: 'RealsenseCamera',
                  data: {
                    name: 'IRS099',
                    serial_number: '99999',
                  },
                },
              ],
            },
          },
        },
        responses: {
          200: {
            description: 'Assets created successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    created: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Names of created assets',
                    },
                    count: { type: 'integer', description: 'Number of assets created' },
                  },
                },
                example: {
                  created: ['Station 2', 'IRS099'],
                  count: 2,
                },
              },
            },
          },
          400: { description: 'Invalid request format' },
          404: { description: 'Platform or collection not found' },
          409: {
            description: 'Duplicate name (asset already exists) or ambiguous collection title (matches multiple collections within the platform)',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
              },
            },
          },
          422: {
            description: 'Validation failed (relation not found, missing required field, etc.)',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/databridge:bulkDelete': {
      post: {
        operationId: 'bulkDelete',
        tags: ['databridge'],
        summary: 'Bulk delete assets using a list of AssetPayload objects',
        description:
          'Delete one or more assets. The request body is an array of AssetPayload objects. Each asset is identified by `data.name` (looked up in the platform\'s lookup table).\n\nThe `platform` and `data` (with `name`) fields are required per asset. The `collection` field is optional — when omitted, the collection is derived from the platform lookup table. When provided, it accepts an internal name or title (case-insensitive, 409 on ambiguity). When `data.id` is provided, it overrides the lookup table ID.\n\nAll operations are ACID — the entire batch succeeds or fails atomically.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: { $ref: '#/components/schemas/AssetPayload' },
              },
              example: [
                {
                  platform: 'models',
                  data: { name: 'Station 1' },
                },
                {
                  platform: 'inventory',
                  collection: 'RealsenseCamera',
                  data: { name: 'IRS026' },
                },
              ],
            },
          },
        },
        responses: {
          200: {
            description: 'Assets deleted successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    deleted: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Names of deleted assets',
                    },
                    count: { type: 'integer', description: 'Number of assets deleted' },
                  },
                },
                example: {
                  deleted: ['Station 1', 'IRS026'],
                  count: 2,
                },
              },
            },
          },
          400: { description: 'Invalid request format' },
          404: {
            description: 'Platform, collection, or asset not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
              },
            },
          },
          422: {
            description: 'Validation error (collection mismatch, etc.)',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
              },
            },
          },
          409: { description: 'Ambiguous collection title — matches multiple collections within the platform' },
        },
      },
    },
    '/databridgeBasic:get': {
      get: {
        operationId: 'basicGetAssets',
        tags: ['databridgeBasic'],
        summary: 'Get assets by collection and filter (platform-free)',
        description:
          'Get assets from a collection using a JSON filter. Returns a list of BasicAssetPayload objects with relation descriptors. Supports BFS relation expansion.',
        parameters: [
          {
            name: 'collection',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description:
              'Collection name or title (case-insensitive). Returns 409 if ambiguous.',
          },
          {
            name: 'filter',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'JSON filter object, e.g. {"name":"Amber"} or {"id":5}',
          },
          {
            name: 'get_relations',
            in: 'query',
            required: false,
            schema: { type: 'boolean', default: false },
            description:
              'If true, BFS-append related records as separate BasicAssetPayload items (deduplicated).',
          },
          {
            name: 'relation_depth',
            in: 'query',
            required: false,
            schema: { type: 'integer', default: 1, minimum: 0 },
            description: 'How deep to traverse relations (only used when get_relations=true).',
          },
        ],
        responses: {
          200: {
            description: 'Assets found',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/BasicAssetPayload' },
                },
              },
            },
          },
          400: { description: 'Missing required parameters or invalid filter JSON' },
          404: { description: 'Collection not found' },
          409: { description: 'Ambiguous collection title' },
        },
      },
    },
    '/databridgeBasic:getSchemaConformant': {
      get: {
        operationId: 'basicGetSchemaConformant',
        tags: ['databridgeBasic'],
        summary: 'Get assets in schema-conformant format (platform-free)',
        description:
          'Get assets and return them as a flat array with `$schema` URLs. Relation fields show name strings (falling back to stringified IDs). The `env` parameter selects the GCS bucket.',
        parameters: [
          {
            name: 'collection',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'Collection name or title (case-insensitive).',
          },
          {
            name: 'filter',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'JSON filter object',
          },
          {
            name: 'env',
            in: 'query',
            required: true,
            schema: { type: 'string', enum: ['prod', 'dev'] },
            description: 'Schema environment. Selects which GCS bucket to use for $schema URLs.',
          },
          {
            name: 'get_relations',
            in: 'query',
            required: false,
            schema: { type: 'boolean', default: false },
            description: 'If true, include related records in the output.',
          },
          {
            name: 'relation_depth',
            in: 'query',
            required: false,
            schema: { type: 'integer', default: 1, minimum: 0 },
            description: 'How deep to traverse relations.',
          },
        ],
        responses: {
          200: {
            description: 'Schema-conformant asset data array',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      $schema: {
                        type: 'string',
                        description: 'URL to the GCS-hosted schema YAML',
                      },
                    },
                    additionalProperties: true,
                  },
                },
              },
            },
          },
          400: { description: 'Missing required parameters or invalid filter/env' },
          404: { description: 'Collection not found' },
          409: { description: 'Ambiguous collection title' },
        },
      },
    },
    '/databridgeBasic:search': {
      get: {
        operationId: 'basicSearchAssets',
        tags: ['databridgeBasic'],
        summary: 'Search assets in a collection (platform-free)',
        description:
          'Search a single collection for records matching a search term. Always searches all text fields and relation .name paths. Returns list of BasicAssetPayload with relation descriptors.',
        parameters: [
          {
            name: 'collection',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'Collection name or title (case-insensitive).',
          },
          {
            name: 'q',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'Search term (case-insensitive substring match)',
          },
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', default: 10, maximum: 100 },
            description: 'Maximum number of results (default: 10, max: 100)',
          },
        ],
        responses: {
          200: {
            description: 'Search results',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/BasicAssetPayload' },
                },
              },
            },
          },
          400: { description: 'Missing required parameters' },
          404: { description: 'Collection not found' },
          409: { description: 'Ambiguous collection title' },
        },
      },
    },
    '/databridgeBasic:list': {
      get: {
        operationId: 'basicListAssets',
        tags: ['databridgeBasic'],
        summary: 'Paginated list of assets in a collection (platform-free)',
        description:
          'List assets from a collection with pagination, sorting, filtering, and field selection. Returns BasicAssetPayload items with relation descriptors and pagination metadata.',
        parameters: [
          {
            name: 'collection',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description:
              'Collection name or title (case-insensitive). Returns 409 if ambiguous.',
          },
          {
            name: 'page',
            in: 'query',
            required: false,
            schema: { type: 'integer', default: 1, minimum: 1 },
            description: 'Page number (1-indexed, default: 1)',
          },
          {
            name: 'pageSize',
            in: 'query',
            required: false,
            schema: { type: 'integer', default: 20, minimum: 1, maximum: 100 },
            description: 'Items per page (default: 20, max: 100)',
          },
          {
            name: 'sort',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description:
              'JSON array of sort keys, e.g. ["-createdAt","name"]. Prefix "-" for descending. Accepts human-readable field names.',
          },
          {
            name: 'filter',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description:
              'JSON filter object, e.g. {"name":"Amber"}. Accepts human-readable field names.',
          },
          {
            name: 'fields',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description:
              'JSON array of field names to include, e.g. ["name","serial_number"]. Accepts human-readable field names. Omit to return all fields.',
          },
        ],
        responses: {
          200: {
            description: 'Paginated list of assets',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/BasicListResponse' },
                example: {
                  data: [
                    {
                      collection: 't_98x374ie2j7',
                      collection_title: 'ArmStation',
                      data: {
                        id: 3,
                        name: 'Station 3',
                        table_type: 'Table',
                      },
                    },
                  ],
                  meta: {
                    page: 1,
                    pageSize: 20,
                    count: 42,
                    totalPage: 3,
                  },
                },
              },
            },
          },
          400: { description: 'Missing required parameters or invalid sort/filter/fields JSON' },
          404: { description: 'Collection not found' },
          409: { description: 'Ambiguous collection title' },
        },
      },
    },
    '/databridgeBasic:bulkCreate': {
      post: {
        operationId: 'basicBulkCreate',
        tags: ['databridgeBasic'],
        summary: 'Bulk create assets (platform-free)',
        description:
          'Create one or more assets. The request body is an array of BasicAssetPayload objects. `collection` and `data` are required per item. `data.id` is ignored (auto-generated). Relation values must be raw FK IDs. All operations are ACID.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: { $ref: '#/components/schemas/BasicAssetPayload' },
              },
              example: [
                {
                  collection: 'ArmStation',
                  data: {
                    name: 'Station 2',
                    table_type: 'Table',
                  },
                },
              ],
            },
          },
        },
        responses: {
          200: {
            description: 'Assets created successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    created: { type: 'array', items: { type: 'integer' }, description: 'IDs of created records' },
                    count: { type: 'integer', description: 'Number of records created' },
                  },
                },
                example: { created: [10, 11], count: 2 },
              },
            },
          },
          400: { description: 'Invalid request format' },
          404: { description: 'Collection not found' },
          409: { description: 'Duplicate entry or ambiguous collection title' },
          422: { description: 'Validation failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        },
      },
    },
    '/databridgeBasic:bulkUpdate': {
      post: {
        operationId: 'basicBulkUpdate',
        tags: ['databridgeBasic'],
        summary: 'Bulk update assets by data.id (platform-free)',
        description:
          'Update one or more assets. Each item requires `collection`, `data` (with `id`). The record is identified by `data.id`. Relation values must be raw FK IDs. All operations are ACID.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: { $ref: '#/components/schemas/BasicAssetPayload' },
              },
              example: [
                {
                  collection: 'ArmStation',
                  data: {
                    id: 3,
                    table_type: 'Desk',
                  },
                },
              ],
            },
          },
        },
        responses: {
          200: {
            description: 'Assets updated successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    updated: { type: 'array', items: { type: 'integer' }, description: 'IDs of updated records' },
                    count: { type: 'integer', description: 'Number of records updated' },
                  },
                },
                example: { updated: [3], count: 1 },
              },
            },
          },
          400: { description: 'Invalid request format' },
          404: { description: 'Collection or record not found' },
          409: { description: 'Ambiguous collection title' },
          422: { description: 'Validation failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        },
      },
    },
    '/databridgeBasic:bulkDelete': {
      post: {
        operationId: 'basicBulkDelete',
        tags: ['databridgeBasic'],
        summary: 'Bulk delete assets by data.id (platform-free)',
        description:
          'Delete one or more assets. Each item requires `collection`, `data` (with `id`). Two-pass: verify all records exist, then delete. All operations are ACID.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: { $ref: '#/components/schemas/BasicAssetPayload' },
              },
              example: [
                {
                  collection: 'ArmStation',
                  data: { id: 3 },
                },
              ],
            },
          },
        },
        responses: {
          200: {
            description: 'Assets deleted successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    deleted: { type: 'array', items: { type: 'integer' }, description: 'IDs of deleted records' },
                    count: { type: 'integer', description: 'Number of records deleted' },
                  },
                },
                example: { deleted: [3], count: 1 },
              },
            },
          },
          400: { description: 'Invalid request format' },
          404: { description: 'Collection or record not found' },
          409: { description: 'Ambiguous collection title' },
          422: { description: 'Validation failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
        },
      },
    },
    '/databridge:listCollections': {
      get: {
        operationId: 'listSyncableCollections',
        tags: ['databridge_platforms'],
        summary: 'List all collections with sync eligibility',
        responses: {
          200: {
            description: 'List of collections',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string', description: 'Internal collection name' },
                      title: { type: 'string', description: 'Human-readable collection title' },
                      hasNameField: { type: 'boolean', description: 'Whether collection has a name field' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/databridge_platforms:list': {
      get: {
        operationId: 'listPlatforms',
        tags: ['databridge_platforms'],
        summary: 'List all platforms',
        responses: {
          200: {
            description: 'List of platforms',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'integer' },
                      name: { type: 'string', description: 'Display name' },
                      slug: { type: 'string', description: 'URL-safe identifier' },
                      description: { type: 'string' },
                      createdAt: { type: 'string', format: 'date-time' },
                      updatedAt: { type: 'string', format: 'date-time' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/databridge_platforms:get': {
      get: {
        operationId: 'getPlatform',
        tags: ['databridge_platforms'],
        summary: 'Get a single platform by ID or slug',
        parameters: [
          {
            name: 'platform',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'Platform ID or slug',
          },
        ],
        responses: {
          200: {
            description: 'Platform details',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    id: { type: 'integer' },
                    name: { type: 'string', description: 'Display name' },
                    slug: { type: 'string', description: 'URL-safe identifier' },
                    description: { type: 'string' },
                    createdAt: { type: 'string', format: 'date-time' },
                    updatedAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
          404: { description: 'Platform not found' },
        },
      },
    },
    '/databridge_platforms:create': {
      post: {
        operationId: 'createPlatform',
        tags: ['databridge_platforms'],
        summary: 'Create a new platform',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'slug'],
                properties: {
                  name: { type: 'string', description: 'Display name' },
                  slug: { type: 'string', description: 'URL-safe identifier' },
                  description: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Platform created' },
          400: { description: 'Invalid input' },
          409: { description: 'Platform already exists' },
        },
      },
    },
    '/databridge_platforms:add': {
      post: {
        operationId: 'addCollections',
        tags: ['databridge_platforms'],
        summary: 'Register collections with a platform and sync their records',
        parameters: [
          {
            name: 'platform',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'Platform ID or slug',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['collections'],
                properties: {
                  collections: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Collection names to register and sync',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Collections registered and synced',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    synced: { type: 'integer', description: 'Number of lookup entries created' },
                    collections: { type: 'integer', description: 'Number of collections registered' },
                  },
                },
              },
            },
          },
          400: { description: 'Missing or invalid parameters' },
          404: { description: 'Platform not found' },
          409: { description: 'Duplicate asset names detected across collections' },
        },
      },
    },
    '/databridge_platforms:remove': {
      post: {
        operationId: 'removeCollections',
        tags: ['databridge_platforms'],
        summary: 'Unregister collections from a platform and delete their lookup entries',
        parameters: [
          {
            name: 'platform',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'Platform ID or slug',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['collections'],
                properties: {
                  collections: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Collection names to unregister',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Collections unregistered',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    removed: { type: 'integer', description: 'Number of lookup entries deleted' },
                    collections: { type: 'integer', description: 'Number of collections unregistered' },
                  },
                },
              },
            },
          },
          400: { description: 'Missing or invalid parameters' },
          404: { description: 'Platform not found' },
        },
      },
    },
    '/databridge_platforms:syncAll': {
      post: {
        operationId: 'syncAll',
        tags: ['databridge_platforms'],
        summary: 'Re-sync all registered collections for a platform',
        description: 'Triggers a full re-sync of all collections currently registered with the platform.',
        parameters: [
          {
            name: 'platform',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'Platform ID or slug',
          },
        ],
        responses: {
          200: {
            description: 'Sync completed',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    synced: { type: 'integer', description: 'Number of entries synced' },
                    collections: { type: 'array', items: { type: 'string' } },
                    errors: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
          404: { description: 'Platform not found' },
        },
      },
    },
    '/databridge_platforms:syncCollection': {
      post: {
        operationId: 'syncCollection',
        tags: ['databridge_platforms'],
        summary: 'Re-sync a single collection for a platform',
        description: 'Triggers a re-sync of a specific collection that is already registered with the platform.',
        parameters: [
          {
            name: 'platform',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'Platform ID or slug',
          },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['collection'],
                properties: {
                  collection: {
                    type: 'string',
                    description:
                      'Collection to re-sync. Accepts internal name or human-readable title (case-insensitive). Returns 409 if the title matches multiple collections within the platform.',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Sync completed',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    synced: { type: 'integer', description: 'Number of entries synced' },
                    collection: { type: 'string' },
                    errors: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
          400: { description: 'Collection not registered with this platform' },
          404: { description: 'Platform or collection not found' },
          409: { description: 'Ambiguous collection title — matches multiple collections within the platform' },
        },
      },
    },
    '/databridge_platforms:deletePlatform': {
      post: {
        operationId: 'deletePlatform',
        tags: ['databridge_platforms'],
        summary: 'Delete a platform',
        parameters: [
          {
            name: 'platform',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'Platform ID or slug',
          },
        ],
        responses: {
          200: { description: 'Platform deleted' },
          404: { description: 'Platform not found' },
        },
      },
    },
    '/databridge_platforms:view': {
      get: {
        operationId: 'viewLookup',
        tags: ['databridge_platforms'],
        summary: 'View platform lookup entries',
        parameters: [
          {
            name: 'platform',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'Platform ID or slug',
          },
          {
            name: 'page',
            in: 'query',
            schema: { type: 'integer', default: 1 },
            description: 'Page number',
          },
          {
            name: 'pageSize',
            in: 'query',
            schema: { type: 'integer', default: 50 },
            description: 'Items per page',
          },
        ],
        responses: {
          200: {
            description: 'Paginated list of lookup entries',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'integer' },
                          name: { type: 'string', description: 'Asset name' },
                          collection: { type: 'string', description: 'Source collection name' },
                          assetId: { type: 'string', description: 'Asset ID in source collection' },
                        },
                      },
                    },
                    meta: {
                      type: 'object',
                      properties: {
                        page: { type: 'integer' },
                        pageSize: { type: 'integer' },
                        total: { type: 'integer' },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: 'Missing platform parameter' },
          404: { description: 'Platform not found' },
        },
      },
    },
  },
};
