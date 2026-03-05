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
    {
      name: 'ui-snapshot-templates',
      description: 'Block template export and import for cross-server migration',
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
        },
      },
      TemplateRecord: {
        type: 'object',
        description: 'Block template metadata from flowModelTemplates table',
        required: ['uid', 'name', 'targetUid'],
        properties: {
          uid: { type: 'string', description: 'Primary key (template UID)' },
          name: { type: 'string', description: 'Human-readable template name' },
          description: { type: 'string', description: 'Template description' },
          targetUid: { type: 'string', description: 'Root flowModel UID of the template content tree' },
          useModel: { type: 'string', description: 'FlowModel class name (e.g., TableBlockModel, DetailsBlockModel)' },
          type: { type: 'string', description: 'Template type: "popup" or null for block templates' },
          dataSourceKey: { type: 'string', description: 'Data source key (e.g., main)' },
          collectionName: { type: 'string', description: 'Collection internal name (e.g., t_xxx)' },
          associationName: { type: 'string', description: 'Association path if template is from an association block' },
          filterByTk: { type: 'string', description: 'Filter by target key' },
          sourceId: { type: 'string', description: 'Source identifier' },
        },
      },
      TemplateSnapshot: {
        type: 'object',
        description: 'Complete template export — metadata + full flowModel tree',
        required: ['template', 'model'],
        properties: {
          template: { $ref: '#/components/schemas/TemplateRecord' },
          model: {
            type: 'object',
            description: 'Full flowModel tree with preserved UIDs',
          },
        },
      },
      TemplateImportResponse: {
        type: 'object',
        properties: {
          imported: { type: 'boolean' },
          uid: { type: 'string' },
          name: { type: 'string' },
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
        parameters: [
          {
            name: 'force',
            in: 'query',
            required: false,
            schema: { type: 'boolean' },
            description: 'Overwrite existing page if it exists',
          },
        ],
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
        parameters: [
          {
            name: 'path',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'Route path of the page to delete (e.g., "Parent/PageName")',
          },
        ],
        responses: {
          200: {
            description: 'Page deleted',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/DeleteResponse' } } },
          },
          400: { description: 'Missing required parameter: path' },
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
    '/ui-snapshot:exportTemplates': {
      get: {
        tags: ['ui-snapshot-templates'],
        summary: 'Export all block templates',
        description:
          'Exports all block templates (flowModelTemplates) with their full flowModel trees. ' +
          'Each template includes its metadata record and the complete flowModel subtree. ' +
          'Original UIDs are preserved for cross-server migration so that ' +
          'ReferenceBlockModel pointers in UI page snapshots resolve correctly.',
        responses: {
          200: {
            description: 'Array of template snapshots',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/TemplateSnapshot' },
                },
              },
            },
          },
        },
      },
    },
    '/ui-snapshot:importTemplates': {
      post: {
        tags: ['ui-snapshot-templates'],
        summary: 'Import a block template',
        description:
          'Imports a single block template with its full flowModel tree. ' +
          'Always overwrites: if a template with the same uid exists, the old flowModel tree ' +
          'and template record are removed first. Original UIDs are preserved so that ' +
          'ReferenceBlockModel pointers from UI page snapshots resolve correctly on the target.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/TemplateSnapshot' },
            },
          },
        },
        responses: {
          200: {
            description: 'Template imported',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/TemplateImportResponse' },
              },
            },
          },
          400: { description: 'Missing required fields' },
        },
      },
    },
  },
};
