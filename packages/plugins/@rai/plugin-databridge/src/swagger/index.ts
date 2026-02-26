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
    { name: 'databridge_platforms', description: 'Platform management' },
  ],
  components: {
    schemas: {
      AssetData: {
        type: 'object',
        properties: {
          id: {
            oneOf: [{ type: 'integer' }, { type: 'string' }],
            description: 'Record ID - REQUIRED for update/delete, auto-generated for create',
          },
          name: {
            type: 'string',
            description: 'Asset name - REQUIRED, must be unique within platform',
          },
        },
        required: ['name'],
        additionalProperties: true,
        description: 'Asset data containing record fields',
      },
      AssetPayload: {
        type: 'object',
        properties: {
          platform: {
            type: 'string',
            description: 'Platform slug (e.g., "models", "inventory") - REQUIRED',
            example: 'models',
          },
          collection: {
            type: 'string',
            description: 'Internal collection name (e.g., "t_98x374ie2j7") - REQUIRED',
            example: 't_98x374ie2j7',
          },
          collection_title: {
            type: 'string',
            description: 'Human-readable collection title (e.g., "ArmStation") - OPTIONAL for input',
            example: 'ArmStation',
          },
          data: {
            $ref: '#/components/schemas/AssetData',
          },
        },
        required: ['platform', 'collection', 'data'],
        description: 'Payload for a single asset, including platform and collection context',
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
            collection: 't_98x374ie2j7',
            collection_title: 'ArmStation',
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
            collection: 't_abc123',
            collection_title: 'RealsenseCamera',
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
    },
  },
  paths: {
    '/databridge:get': {
      get: {
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
              oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
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
          {
            name: 'response_type',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['default', 'dippy_prod', 'dippy_dev'], default: 'default' },
            description:
              'Response format. "default" returns nested object keyed by asset name. "dippy_prod" or "dippy_dev" returns flattened array with $schema URLs pointing to GCS-hosted OpenAPI schemas.',
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
    '/databridge:search': {
      get: {
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
            description: 'Limit search to a specific collection (accepts internal name or title)',
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
        },
      },
    },
    '/databridge:list': {
      get: {
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
        tags: ['databridge'],
        summary: 'Bulk update assets using unified AssetPayloadMap format',
        description:
          'Update one or more assets using the AssetPayloadMap format. The platform is specified per-asset in the payload (no query parameter). Supports multi-platform operations in a single request. All operations are ACID - the entire batch succeeds or fails atomically. The `data.id` field is REQUIRED to identify the record to update.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AssetPayloadMap' },
              example: {
                'Station 1': {
                  platform: 'models',
                  collection: 't_98x374ie2j7',
                  collection_title: 'ArmStation',
                  data: {
                    id: 1,
                    name: 'Station 1',
                    left_gpu: 'WS63',
                    right_gpu: 'WS64',
                  },
                },
                IRS026: {
                  platform: 'inventory',
                  collection: 't_abc123',
                  data: {
                    id: 26,
                    name: 'IRS026',
                    serial_number: '999999',
                  },
                },
              },
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
          400: { description: 'Invalid request format or missing data.id' },
          404: { description: 'Platform or asset not found' },
          422: {
            description: 'Validation failed (relation not found, type mismatch, etc.)',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/databridge:bulkCreate': {
      post: {
        tags: ['databridge'],
        summary: 'Bulk create assets using unified AssetPayloadMap format',
        description:
          'Create one or more assets using the AssetPayloadMap format. The platform is specified per-asset in the payload (no query parameter). Supports multi-platform operations in a single request. The `id` field in data is ignored (auto-generated). All operations are ACID - the entire batch succeeds or fails atomically.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AssetPayloadMap' },
              example: {
                'Station 2': {
                  platform: 'models',
                  collection: 't_98x374ie2j7',
                  data: {
                    name: 'Station 2',
                    left_gpu: 'WS63',
                    right_gpu: 'WS64',
                    table_type: 'Table',
                  },
                },
                IRS099: {
                  platform: 'models',
                  collection: 't_abc123',
                  data: {
                    name: 'IRS099',
                    serial_number: '99999',
                  },
                },
              },
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
            description: 'Duplicate name - asset already exists',
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
        tags: ['databridge'],
        summary: 'Bulk delete assets using unified AssetPayloadMap format',
        description:
          'Delete one or more assets using the AssetPayloadMap format. The platform is specified per-asset in the payload (no query parameter). Supports multi-platform operations in a single request. Only `platform`, `collection`, and `data.name` are required (data.id can be used for lookup). All operations are ACID - the entire batch succeeds or fails atomically.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AssetPayloadMap' },
              example: {
                'Station 1': {
                  platform: 'models',
                  collection: 't_98x374ie2j7',
                  data: {
                    id: 1,
                    name: 'Station 1',
                  },
                },
                IRS026: {
                  platform: 'inventory',
                  collection: 't_abc123',
                  data: {
                    id: 42,
                    name: 'IRS026',
                  },
                },
              },
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
            description: 'Validation error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/databridge:listCollections': {
      get: {
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
        tags: ['databridge_platforms'],
        summary: 'Get a single platform by ID or slug',
        parameters: [
          {
            name: 'filterByTk',
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
    '/databridge_platforms:sync': {
      post: {
        tags: ['databridge_platforms'],
        summary: 'Sync collections to a platform',
        parameters: [
          {
            name: 'filterByTk',
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
                required: ['collections'],
                properties: {
                  collections: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Collection names to sync',
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
    '/databridge_platforms:syncAll': {
      post: {
        tags: ['databridge_platforms'],
        summary: 'Re-sync all registered collections for a platform',
        description: 'Triggers a full re-sync of all collections currently registered with the platform.',
        parameters: [
          {
            name: 'filterByTk',
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
        tags: ['databridge_platforms'],
        summary: 'Re-sync a single collection for a platform',
        description: 'Triggers a re-sync of a specific collection that is already registered with the platform.',
        parameters: [
          {
            name: 'filterByTk',
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
                    description: 'Collection name to re-sync',
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
          404: { description: 'Platform not found' },
        },
      },
    },
    '/databridge_platforms:removeCollection': {
      post: {
        tags: ['databridge_platforms'],
        summary: 'Remove a collection from a platform',
        description:
          'Removes a collection from the platform and deletes all associated lookup entries. The source collection data is not affected.',
        parameters: [
          {
            name: 'filterByTk',
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
                    description: 'Collection name to remove',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Collection removed',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    removed: { type: 'integer', description: 'Number of lookup entries deleted' },
                    collection: { type: 'string' },
                  },
                },
              },
            },
          },
          400: { description: 'Collection not registered with this platform' },
          404: { description: 'Platform not found' },
        },
      },
    },
    '/databridge_platforms:destroy': {
      post: {
        tags: ['databridge_platforms'],
        summary: 'Delete a platform',
        parameters: [
          {
            name: 'filterByTk',
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
        tags: ['databridge_platforms'],
        summary: 'View platform lookup entries',
        parameters: [
          {
            name: 'filterByTk',
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
          400: { description: 'Missing filterByTk parameter' },
          404: { description: 'Platform not found' },
        },
      },
    },
  },
};
