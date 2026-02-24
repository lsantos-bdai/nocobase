/**
 * OpenAPI path definitions for NocoBase field endpoints
 */

// /fields:list
export const fieldsList = {
  get: {
    tags: ['fields'],
    summary: 'List all fields',
    description: 'Returns a paginated list of all fields across all collections',
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
        description: 'Paginated list of fields',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/FieldModel' },
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
    },
  },
};

// /fields:get
export const fieldsGet = {
  get: {
    tags: ['fields'],
    summary: 'Get a single field',
    description: 'Returns a single field by its key (UID)',
    parameters: [
      {
        name: 'filterByTk',
        in: 'query',
        required: true,
        description: 'Field key (UID)',
        schema: { type: 'string' },
      },
      { $ref: '#/components/parameters/filter' },
      { $ref: '#/components/parameters/fields' },
      { $ref: '#/components/parameters/appends' },
      { $ref: '#/components/parameters/except' },
    ],
    responses: {
      '200': {
        description: 'Field details',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: { $ref: '#/components/schemas/FieldModel' },
              },
            },
          },
        },
      },
      '404': {
        description: 'Field not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  },
};

// /collections/{collectionName}/fields:list
export const nestedFieldsList = {
  get: {
    tags: ['collections.fields'],
    summary: 'List fields for a collection',
    description: 'Returns a paginated list of fields belonging to a specific collection',
    parameters: [
      { $ref: '#/components/parameters/collectionNamePath' },
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
        description: 'Paginated list of fields',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/FieldModel' },
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

// /collections/{collectionName}/fields:get
export const nestedFieldsGet = {
  get: {
    tags: ['collections.fields'],
    summary: 'Get a specific field from a collection',
    description: 'Returns a single field from a collection by its key or name',
    parameters: [
      { $ref: '#/components/parameters/collectionNamePath' },
      {
        name: 'filterByTk',
        in: 'query',
        required: true,
        description: 'Field key (UID) or field name',
        schema: { type: 'string' },
      },
      { $ref: '#/components/parameters/filter' },
      { $ref: '#/components/parameters/fields' },
      { $ref: '#/components/parameters/appends' },
      { $ref: '#/components/parameters/except' },
    ],
    responses: {
      '200': {
        description: 'Field details',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: { $ref: '#/components/schemas/FieldModel' },
              },
            },
          },
        },
      },
      '404': {
        description: 'Field or collection not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  },
};

// /collections/{collectionName}/fields:create
export const nestedFieldsCreate = {
  post: {
    tags: ['collections.fields'],
    summary: 'Create a new field in a collection',
    description: 'Creates a new field in the specified collection',
    parameters: [
      { $ref: '#/components/parameters/collectionNamePath' },
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
              values: { $ref: '#/components/schemas/FieldCreateInput' },
            },
          },
          example: {
            values: {
              name: 'new_field',
              type: 'string',
              interface: 'input',
              description: 'A new field',
              options: {
                unique: false,
                defaultValue: null,
                required: false,
              },
            },
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'Created field',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: { $ref: '#/components/schemas/FieldModel' },
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

// /collections/{collectionName}/fields:update
export const nestedFieldsUpdate = {
  post: {
    tags: ['collections.fields'],
    summary: 'Update a field in a collection',
    description: 'Updates an existing field in the specified collection',
    parameters: [
      { $ref: '#/components/parameters/collectionNamePath' },
      {
        name: 'filterByTk',
        in: 'query',
        required: true,
        description: 'Field key (UID)',
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
                  description: { type: 'string' },
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
        description: 'Updated field',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: { $ref: '#/components/schemas/FieldModel' },
              },
            },
          },
        },
      },
      '404': {
        description: 'Field or collection not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  },
};

// /collections/{collectionName}/fields:destroy
export const nestedFieldsDestroy = {
  post: {
    tags: ['collections.fields'],
    summary: 'Delete a field from a collection',
    description: 'Deletes a field from the specified collection',
    parameters: [
      { $ref: '#/components/parameters/collectionNamePath' },
      {
        name: 'filterByTk',
        in: 'query',
        required: true,
        description: 'Field key (UID) or field name',
        schema: { type: 'string' },
      },
      { $ref: '#/components/parameters/filter' },
    ],
    responses: {
      '200': {
        description: 'Field deleted',
      },
      '404': {
        description: 'Field or collection not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  },
};

// /collections/{collectionName}/fields:move
export const nestedFieldsMove = {
  post: {
    tags: ['collections.fields'],
    summary: 'Reorder fields in a collection',
    description: 'Moves a field to a new position within the collection',
    parameters: [{ $ref: '#/components/parameters/collectionNamePath' }],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/MoveRequestBody' },
          example: {
            sourceId: 'field_key_to_move',
            targetId: 'field_key_target',
            targetScope: 'my_collection',
            sticky: false,
            method: 'insertAfter',
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'Field reordered',
      },
      '404': {
        description: 'Field or collection not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  },
};

export default {
  // Top-level fields endpoints
  '/fields:list': fieldsList,
  '/fields:get': fieldsGet,
  // Nested fields endpoints (under collections)
  '/collections/{collectionName}/fields:list': nestedFieldsList,
  '/collections/{collectionName}/fields:get': nestedFieldsGet,
  '/collections/{collectionName}/fields:create': nestedFieldsCreate,
  '/collections/{collectionName}/fields:update': nestedFieldsUpdate,
  '/collections/{collectionName}/fields:destroy': nestedFieldsDestroy,
  '/collections/{collectionName}/fields:move': nestedFieldsMove,
};
