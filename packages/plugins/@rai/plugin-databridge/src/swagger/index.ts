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
    { name: 'databridge', description: 'Asset lookup operations' },
    { name: 'databridge_platforms', description: 'Platform management' },
  ],
  paths: {
    '/databridge:lookup': {
      get: {
        tags: ['databridge'],
        summary: 'Look up assets by platform and name(s)',
        description:
          'Look up one or more assets by name. Supports relation traversal to recursively fetch related assets.',
        parameters: [
          {
            name: 'platform',
            in: 'query',
            required: true,
            schema: { type: 'string', example: 'models' },
            description: 'Platform slug',
          },
          {
            name: 'asset_name',
            in: 'query',
            required: true,
            schema: {
              oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
              example: 'spot_arm_v2',
            },
            description: 'Asset name(s) to look up. Can be a single name or multiple names.',
          },
          {
            name: 'get_relations',
            in: 'query',
            required: false,
            schema: { type: 'boolean', default: false, example: false },
            description: 'If true, recursively fetch related assets registered in the same platform.',
          },
          {
            name: 'relation_depth',
            in: 'query',
            required: false,
            schema: { type: 'integer', default: 1, minimum: 0, example: 1 },
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
            description: 'Assets found (keyed by asset name)',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: {
                    type: 'object',
                    properties: {
                      platform: { type: 'string', example: 'models' },
                      collection: { type: 'string', example: 't_98x374ie2j7', description: 'Internal collection name' },
                      collection_title: {
                        type: 'string',
                        example: 'Robots',
                        description: 'Human-readable collection title',
                      },
                      data: {
                        type: 'object',
                        description:
                          'Asset data with resolved field names (from field titles, normalized to snake_case) and relation values (fetched from related records)',
                        example: {
                          name: 'spot_arm_v2',
                          robot_model: 'Franka Research 3',
                          serial_number: 'SN-001234',
                          status: 'active',
                        },
                      },
                    },
                  },
                  example: {
                    spot_arm_v2: {
                      platform: 'models',
                      collection: 't_abc123xyz',
                      collection_title: 'Robots',
                      data: {
                        name: 'spot_arm_v2',
                        robot_model: 'Franka Research 3',
                        serial_number: 'SN-001234',
                        status: 'active',
                      },
                    },
                    'Franka Research 3': {
                      platform: 'models',
                      collection: 't_def456uvw',
                      collection_title: 'Robot Models',
                      data: {
                        name: 'Franka Research 3',
                        manufacturer: 'Franka Emika',
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: 'Missing required parameters' },
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
                      name: { type: 'string', example: 'robots' },
                      title: { type: 'string', example: 'Robots' },
                      hasNameField: { type: 'boolean', example: true },
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
                      id: { type: 'integer', example: 9 },
                      name: { type: 'string', example: 'Models' },
                      slug: { type: 'string', example: 'models' },
                      description: { type: 'string', example: 'Robot model assets' },
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
            schema: { type: 'string', example: 'models' },
            description: "Platform ID (e.g., '9') or slug (e.g., 'models')",
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
                    id: { type: 'integer', example: 9 },
                    name: { type: 'string', example: 'Models' },
                    slug: { type: 'string', example: 'models' },
                    description: { type: 'string', example: 'Robot model assets' },
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
                  name: { type: 'string', description: 'Display name', example: 'Models' },
                  slug: { type: 'string', description: 'URL-safe identifier', example: 'models' },
                  description: { type: 'string', example: 'Robot model assets' },
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
            schema: { type: 'string', example: '9' },
            description: "Platform ID (e.g., '9') or slug (e.g., 'models')",
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
                    example: ['robots', 'sensors'],
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
                    synced: { type: 'integer', example: 42 },
                    errors: { type: 'array', items: { type: 'string' }, example: [] },
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
            schema: { type: 'string', example: 'models' },
            description: "Platform ID (e.g., '9') or slug (e.g., 'models')",
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
                    synced: { type: 'integer', example: 150 },
                    collections: { type: 'array', items: { type: 'string' }, example: ['robots', 'sensors'] },
                    errors: { type: 'array', items: { type: 'string' }, example: [] },
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
            schema: { type: 'string', example: 'models' },
            description: "Platform ID (e.g., '9') or slug (e.g., 'models')",
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
                    example: 'robots',
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
                    synced: { type: 'integer', example: 25 },
                    collection: { type: 'string', example: 'robots' },
                    errors: { type: 'array', items: { type: 'string' }, example: [] },
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
            schema: { type: 'string', example: 'models' },
            description: "Platform ID (e.g., '9') or slug (e.g., 'models')",
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
                    example: 'robots',
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
                    removed: { type: 'integer', description: 'Number of lookup entries deleted', example: 25 },
                    collection: { type: 'string', example: 'robots' },
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
            schema: { type: 'string', example: '9' },
            description: "Platform ID (e.g., '9') or slug (e.g., 'models')",
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
            schema: { type: 'string', example: 'models' },
            description: "Platform ID (e.g., '9') or slug (e.g., 'models')",
          },
          {
            name: 'page',
            in: 'query',
            schema: { type: 'integer', default: 1, example: 1 },
            description: 'Page number',
          },
          {
            name: 'pageSize',
            in: 'query',
            schema: { type: 'integer', default: 50, example: 50 },
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
                          id: { type: 'integer', example: 1 },
                          name: { type: 'string', description: 'Asset name', example: 'spot_arm_v2' },
                          collection: { type: 'string', description: 'Source collection name', example: 'robots' },
                          assetId: { type: 'string', description: 'Asset ID in source collection', example: '42' },
                        },
                      },
                    },
                    meta: {
                      type: 'object',
                      properties: {
                        page: { type: 'integer', example: 1 },
                        pageSize: { type: 'integer', example: 50 },
                        total: { type: 'integer', example: 150 },
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
