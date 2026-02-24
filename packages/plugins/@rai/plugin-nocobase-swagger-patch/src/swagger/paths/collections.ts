/**
 * OpenAPI path definitions for NocoBase collection endpoints
 */

// /collections:list
export const collectionsList = {
  get: {
    tags: ['collections'],
    summary: 'List all collections',
    description: 'Returns a paginated list of all collections',
    parameters: [
      { $ref: '#/components/parameters/paginate' },
      { $ref: '#/components/parameters/page' },
      { $ref: '#/components/parameters/pageSize' },
      { $ref: '#/components/parameters/filter' },
      { $ref: '#/components/parameters/fields' },
      { $ref: '#/components/parameters/appends' },
      { $ref: '#/components/parameters/except' },
      { $ref: '#/components/parameters/sort' },
    ],
    responses: {
      '200': {
        description: 'Paginated list of collections',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/CollectionModel' },
                },
                meta: {
                  type: 'object',
                  properties: {
                    count: { type: 'integer', description: 'Total count' },
                    page: { type: 'integer', description: 'Current page' },
                    pageSize: { type: 'integer', description: 'Items per page' },
                    totalPage: { type: 'integer', description: 'Total pages' },
                  },
                },
              },
            },
          },
        },
      },
      '401': {
        description: 'Unauthorized',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  },
};

// /collections:listMeta (custom action)
export const collectionsListMeta = {
  get: {
    tags: ['collections'],
    summary: 'Get full collection metadata including fields',
    description: 'Returns an array of collections with their full field definitions',
    parameters: [
      { $ref: '#/components/parameters/paginate' },
      { $ref: '#/components/parameters/filter' },
    ],
    responses: {
      '200': {
        description: 'Array of collections with fields',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/CollectionModelWithFields' },
                },
              },
            },
          },
        },
      },
    },
  },
};

// /collections:get
export const collectionsGet = {
  get: {
    tags: ['collections'],
    summary: 'Get a single collection',
    description: 'Returns a single collection by name',
    parameters: [
      {
        name: 'filterByTk',
        in: 'query',
        required: true,
        description: 'Collection name',
        schema: { type: 'string' },
      },
      { $ref: '#/components/parameters/filter' },
      { $ref: '#/components/parameters/fields' },
      { $ref: '#/components/parameters/appends' },
      { $ref: '#/components/parameters/except' },
    ],
    responses: {
      '200': {
        description: 'Collection details',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: { $ref: '#/components/schemas/CollectionModel' },
              },
            },
          },
        },
      },
      '404': {
        description: 'Collection not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  },
};

// /collections:create
export const collectionsCreate = {
  post: {
    tags: ['collections'],
    summary: 'Create a new collection',
    description: 'Creates a new collection with optional fields',
    parameters: [
      { $ref: '#/components/parameters/whitelist' },
      { $ref: '#/components/parameters/blacklist' },
    ],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['values'],
            properties: {
              values: { $ref: '#/components/schemas/CollectionCreateInput' },
            },
          },
          example: {
            values: {
              name: 'test_collection',
              title: 'Test Collection',
              inherit: false,
              hidden: false,
              description: 'A test collection',
              autoGenId: true,
              sortable: false,
              timestamps: true,
              createdAt: true,
              createdBy: true,
              updatedAt: true,
              updatedBy: true,
              fields: [
                {
                  name: 'title',
                  type: 'string',
                  interface: 'input',
                },
              ],
            },
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'Created collection',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: { $ref: '#/components/schemas/CollectionModel' },
              },
            },
          },
        },
      },
      '400': {
        description: 'Validation error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  },
};

// /collections:update
export const collectionsUpdate = {
  post: {
    tags: ['collections'],
    summary: 'Update a collection',
    description: 'Updates an existing collection',
    parameters: [
      {
        name: 'filterByTk',
        in: 'query',
        required: true,
        description: 'Collection name',
        schema: { type: 'string' },
      },
      { $ref: '#/components/parameters/filter' },
      { $ref: '#/components/parameters/whitelist' },
      { $ref: '#/components/parameters/blacklist' },
    ],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['values'],
            properties: {
              values: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string' },
                  hidden: { type: 'boolean' },
                  options: { type: 'object' },
                },
              },
            },
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'Updated collection',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: { $ref: '#/components/schemas/CollectionModel' },
              },
            },
          },
        },
      },
      '404': {
        description: 'Collection not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  },
};

// /collections:destroy
export const collectionsDestroy = {
  post: {
    tags: ['collections'],
    summary: 'Delete a collection',
    description: 'Deletes a collection and optionally cascades to associated records',
    parameters: [
      {
        name: 'filterByTk',
        in: 'query',
        required: true,
        description: 'Collection name',
        schema: { type: 'string' },
      },
      { $ref: '#/components/parameters/filter' },
      { $ref: '#/components/parameters/cascade' },
    ],
    responses: {
      '200': {
        description: 'Collection deleted',
      },
      '404': {
        description: 'Collection not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  },
};

// /collections:setFields (custom action)
export const collectionsSetFields = {
  post: {
    tags: ['collections'],
    summary: 'Batch update fields for a collection',
    description:
      'Updates existing fields, creates new fields, and destroys missing fields. Performs a full sync of the fields array.',
    parameters: [
      {
        name: 'filterByTk',
        in: 'query',
        required: true,
        description: 'Collection name',
        schema: { type: 'string' },
      },
    ],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['values'],
            properties: {
              values: {
                type: 'object',
                required: ['fields'],
                properties: {
                  fields: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/FieldCreateInput' },
                  },
                },
              },
            },
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'Fields updated',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: { $ref: '#/components/schemas/CollectionModelWithFields' },
              },
            },
          },
        },
      },
    },
  },
};

export default {
  '/collections:list': collectionsList,
  '/collections:listMeta': collectionsListMeta,
  '/collections:get': collectionsGet,
  '/collections:create': collectionsCreate,
  '/collections:update': collectionsUpdate,
  '/collections:destroy': collectionsDestroy,
  '/collections:setFields': collectionsSetFields,
};
