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
    '/databridge:get': {
      get: {
        tags: ['databridge'],
        summary: 'Get assets by platform and name(s)',
        description:
          'Get one or more assets by name. Supports relation traversal to recursively fetch related assets.',
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
            description: 'Assets found (keyed by asset name)',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: {
                    type: 'object',
                    properties: {
                      platform: { type: 'string', description: 'Platform slug' },
                      collection: { type: 'string', description: 'Internal collection name' },
                      collection_title: {
                        type: 'string',
                        description: 'Human-readable collection title',
                      },
                      data: {
                        type: 'object',
                        description:
                          'Asset data with resolved field names (from field titles, normalized to snake_case) and relation values (fetched from related records)',
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
            description: 'Search results (keyed by asset name)',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: {
                    type: 'object',
                    properties: {
                      platform: { type: 'string', description: 'Platform slug' },
                      collection: { type: 'string', description: 'Internal collection name' },
                      collection_title: { type: 'string', description: 'Human-readable collection title' },
                      data: {
                        type: 'object',
                        description: 'Asset data with resolved field names and relation values',
                      },
                    },
                  },
                },
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
