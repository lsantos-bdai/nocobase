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
        summary: 'Look up an asset by platform and name',
        parameters: [
          { name: 'platform', in: 'query', required: true, schema: { type: 'string' }, description: 'Platform slug' },
          { name: 'asset_name', in: 'query', required: true, schema: { type: 'string' }, description: 'Asset name' },
        ],
        responses: {
          200: {
            description: 'Asset found',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    platform: { type: 'string' },
                    asset_name: { type: 'string' },
                    collection: { type: 'string' },
                    data: { type: 'object' },
                  },
                },
              },
            },
          },
          400: { description: 'Missing required parameters' },
          404: { description: 'Platform or asset not found' },
        },
      },
    },
    '/databridge:listCollections': {
      get: {
        tags: ['databridge'],
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
                      name: { type: 'string' },
                      title: { type: 'string' },
                      hasNameField: { type: 'boolean' },
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
                      name: { type: 'string' },
                      slug: { type: 'string' },
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
        summary: 'Get a single platform by ID',
        parameters: [
          { name: 'filterByTk', in: 'query', required: true, schema: { type: 'integer' }, description: 'Platform ID' },
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
                    name: { type: 'string' },
                    slug: { type: 'string' },
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
          { name: 'filterByTk', in: 'query', required: true, schema: { type: 'integer' }, description: 'Platform ID' },
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
                    synced: { type: 'integer' },
                    errors: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/databridge_platforms:destroy': {
      post: {
        tags: ['databridge_platforms'],
        summary: 'Delete a platform',
        parameters: [
          { name: 'filterByTk', in: 'query', required: true, schema: { type: 'integer' }, description: 'Platform ID' },
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
          { name: 'filterByTk', in: 'query', required: true, schema: { type: 'integer' }, description: 'Platform ID' },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 }, description: 'Page number' },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 50 }, description: 'Items per page' },
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
