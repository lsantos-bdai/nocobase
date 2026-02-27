/**
 * OpenAPI/Swagger documentation for UI Snapshot plugin
 */

export default {
  info: {
    title: 'NocoBase API - UI Snapshot plugin',
  },
  tags: [
    {
      name: 'ui-snapshot',
      description: 'Lossless UI page export and import',
    },
  ],
  components: {
    schemas: {
      FlowModel: {
        type: 'object',
        description: 'Complete NocoBase FlowModel',
        properties: {
          uid: { type: 'string' },
          use: { type: 'string', description: 'Model type (e.g., TableBlockModel)' },
          parentId: { type: 'string' },
          subKey: { type: 'string' },
          subType: { type: 'string', enum: ['array', 'object'] },
          sortIndex: { type: 'integer' },
          stepParams: { type: 'object', description: 'Complete model configuration' },
          flowRegistry: { type: 'object' },
          subModels: { type: 'object' },
        },
      },
      PageSnapshot: {
        type: 'object',
        description: 'Lossless page snapshot - used for both export and create',
        required: ['page', 'rootUid', 'flowModels'],
        properties: {
          page: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              route: { type: 'string' },
            },
          },
          rootUid: { type: 'string', description: 'Root FlowModel UID' },
          flowModels: {
            type: 'object',
            additionalProperties: { $ref: '#/components/schemas/FlowModel' },
          },
          collections: {
            type: 'array',
            items: { type: 'string' },
          },
          force: { type: 'boolean', description: 'Overwrite existing page (create only)' },
        },
      },
      UISnapshot: {
        type: 'object',
        properties: {
          exported_at: { type: 'string', format: 'date-time' },
          pages: { type: 'array', items: { $ref: '#/components/schemas/PageSnapshot' } },
          pageCount: { type: 'integer' },
        },
      },
      CreateResponse: {
        type: 'object',
        properties: {
          routeId: { type: 'integer' },
          pageUid: { type: 'string' },
          modelsImported: { type: 'integer' },
          path: { type: 'string' },
        },
      },
      DeleteRequest: {
        type: 'object',
        required: ['path'],
        properties: {
          path: { type: 'string' },
        },
      },
      DeleteResponse: {
        type: 'object',
        properties: {
          deleted: { type: 'boolean' },
          path: { type: 'string' },
          flowModelsDeleted: { type: 'integer' },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          message: { type: 'string' },
        },
      },
    },
  },
  paths: {
    '/ui-snapshot:create': {
      post: {
        tags: ['ui-snapshot'],
        summary: 'Create page from snapshot',
        description: 'Creates a page from a PageSnapshot (same format as export). UIDs are remapped to avoid conflicts.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PageSnapshot' },
            },
          },
        },
        responses: {
          200: {
            description: 'Page created',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateResponse' } } },
          },
          400: { description: 'Missing required fields' },
          409: { description: 'Page already exists' },
        },
      },
    },
    '/ui-snapshot:delete': {
      post: {
        tags: ['ui-snapshot'],
        summary: 'Delete page',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/DeleteRequest' },
            },
          },
        },
        responses: {
          200: {
            description: 'Page deleted',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/DeleteResponse' } } },
          },
          404: { description: 'Page not found' },
        },
      },
    },
    '/ui-snapshot:export': {
      get: {
        tags: ['ui-snapshot'],
        summary: 'Export page',
        description: 'Exports a page as a lossless PageSnapshot. Can be directly used with create endpoint.',
        parameters: [
          {
            name: 'path',
            in: 'query',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: {
            description: 'Page snapshot',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/PageSnapshot' } } },
          },
          404: { description: 'Page not found' },
        },
      },
    },
    '/ui-snapshot:exportAll': {
      get: {
        tags: ['ui-snapshot'],
        summary: 'Export all pages',
        responses: {
          200: {
            description: 'UI snapshot',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/UISnapshot' } } },
          },
        },
      },
    },
  },
};
