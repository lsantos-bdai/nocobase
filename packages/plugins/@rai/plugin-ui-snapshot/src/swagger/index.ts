/**
 * OpenAPI/Swagger documentation for UI Snapshot plugin
 *
 * Recipe Format - human-readable JSON that can recreate NocoBase pages
 */

export default {
  info: {
    title: 'NocoBase API - UI Snapshot plugin',
  },
  tags: [
    {
      name: 'ui-snapshot',
      description: 'Recipe-based UI page creation, export, and management',
    },
  ],
  components: {
    schemas: {
      Recipe: {
        type: 'object',
        description: 'Human-readable page configuration (Recipe format)',
        required: ['page', 'layout', 'blocks'],
        properties: {
          page: { $ref: '#/components/schemas/PageConfig' },
          collections: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: 'Map of collection aliases to internal names (e.g., {"Workstation": "t_9dx8b5vb55b"})',
          },
          layout: { $ref: '#/components/schemas/Layout' },
          blocks: {
            type: 'object',
            additionalProperties: { $ref: '#/components/schemas/Block' },
            description: 'Block configurations keyed by ID',
          },
        },
        example: {
          page: {
            title: 'Workstations',
            icon: 'DesktopOutlined',
            route: 'EngOps/Workstations',
          },
          collections: {
            Workstation: 't_9dx8b5vb55b',
          },
          layout: {
            rows: [
              {
                columns: [
                  { width: 15, blocks: ['table1'] },
                  { width: 9, blocks: ['chart1', 'chart2'] },
                ],
              },
            ],
          },
          blocks: {
            table1: {
              type: 'table',
              collection: 'Workstation',
              columns: [
                { field: 'name', sortable: true },
                { field: 'os', displayType: 'select' },
                'ip_address',
                'location',
              ],
              pageSize: 20,
              actions: {
                toolbar: ['filter', 'create', 'refresh'],
                row: [
                  {
                    type: 'view',
                    popup: {
                      tabs: [
                        {
                          title: 'Details',
                          blocks: [
                            {
                              type: 'details',
                              collection: 'Workstation',
                              fields: ['name', 'os', 'ip_address'],
                            },
                          ],
                        },
                      ],
                    },
                  },
                  'delete',
                ],
              },
            },
            chart1: {
              type: 'chart',
              collection: 'Workstation',
              chartType: 'pie',
              dimension: 'os',
              measure: { field: 'id', aggregation: 'count' },
            },
            chart2: {
              type: 'chart',
              collection: 'Workstation',
              chartType: 'bar',
              dimension: 'location',
              measure: { field: 'id', aggregation: 'count' },
            },
          },
        },
      },
      PageConfig: {
        type: 'object',
        required: ['title'],
        properties: {
          title: { type: 'string', description: 'Page title displayed in navigation' },
          icon: { type: 'string', description: 'Ant Design icon name (e.g., "DesktopOutlined")' },
          route: { type: 'string', description: 'Route path (e.g., "EngOps/Workstations")' },
        },
      },
      Layout: {
        type: 'object',
        required: ['rows'],
        properties: {
          rows: {
            type: 'array',
            items: { $ref: '#/components/schemas/Row' },
          },
        },
      },
      Row: {
        type: 'object',
        properties: {
          columns: {
            type: 'array',
            items: { $ref: '#/components/schemas/Column' },
          },
        },
      },
      Column: {
        type: 'object',
        properties: {
          width: { type: 'integer', minimum: 1, maximum: 24, description: 'Column width out of 24' },
          blocks: {
            type: 'array',
            items: { type: 'string' },
            description: 'Block IDs referencing keys in Recipe.blocks',
          },
        },
      },
      Block: {
        type: 'object',
        description: 'Block configuration (discriminated union by type)',
        oneOf: [
          { $ref: '#/components/schemas/TableBlock' },
          { $ref: '#/components/schemas/ChartBlock' },
          { $ref: '#/components/schemas/DetailsBlock' },
          { $ref: '#/components/schemas/FormBlock' },
          { $ref: '#/components/schemas/MarkdownBlock' },
        ],
        discriminator: {
          propertyName: 'type',
          mapping: {
            table: '#/components/schemas/TableBlock',
            chart: '#/components/schemas/ChartBlock',
            details: '#/components/schemas/DetailsBlock',
            form: '#/components/schemas/FormBlock',
            markdown: '#/components/schemas/MarkdownBlock',
          },
        },
      },
      TableBlock: {
        type: 'object',
        required: ['type', 'collection', 'columns'],
        properties: {
          type: { type: 'string', enum: ['table'] },
          collection: { type: 'string', description: 'Collection alias' },
          columns: {
            type: 'array',
            items: {
              oneOf: [
                { type: 'string', description: 'Field name (shorthand)' },
                { $ref: '#/components/schemas/ColumnConfig' },
              ],
            },
          },
          actions: {
            type: 'object',
            properties: {
              toolbar: {
                type: 'array',
                items: { type: 'string', enum: ['filter', 'create', 'refresh', 'export'] },
              },
              row: {
                type: 'array',
                items: {
                  oneOf: [
                    { type: 'string', enum: ['delete'] },
                    { $ref: '#/components/schemas/ViewAction' },
                    { $ref: '#/components/schemas/EditAction' },
                  ],
                },
              },
            },
          },
          pageSize: { type: 'integer', default: 20 },
          defaultSort: {
            type: 'object',
            properties: {
              field: { type: 'string' },
              order: { type: 'string', enum: ['asc', 'desc'] },
            },
          },
          quickEdit: { type: 'boolean' },
        },
      },
      ColumnConfig: {
        type: 'object',
        required: ['field'],
        properties: {
          field: { type: 'string' },
          displayType: { type: 'string', enum: ['text', 'checkbox', 'date', 'number', 'select', 'tag', 'link', 'image'] },
          width: { type: 'integer' },
          sortable: { type: 'boolean' },
          fixed: { type: 'string', enum: ['left', 'right'] },
        },
      },
      ViewAction: {
        type: 'object',
        required: ['type', 'popup'],
        properties: {
          type: { type: 'string', enum: ['view'] },
          popup: { $ref: '#/components/schemas/Popup' },
        },
      },
      EditAction: {
        type: 'object',
        required: ['type', 'popup'],
        properties: {
          type: { type: 'string', enum: ['edit'] },
          popup: { $ref: '#/components/schemas/Popup' },
        },
      },
      Popup: {
        type: 'object',
        required: ['tabs'],
        properties: {
          displayTitle: { type: 'boolean' },
          tabs: {
            type: 'array',
            items: { $ref: '#/components/schemas/Tab' },
          },
        },
      },
      Tab: {
        type: 'object',
        required: ['title', 'blocks'],
        properties: {
          title: { type: 'string' },
          icon: { type: 'string' },
          blocks: {
            type: 'array',
            items: { $ref: '#/components/schemas/InlineBlock' },
            description: 'Inline block definitions (details, form, or markdown)',
          },
        },
      },
      InlineBlock: {
        type: 'object',
        description: 'Block for popups (details, form, or markdown)',
        oneOf: [
          { $ref: '#/components/schemas/DetailsBlock' },
          { $ref: '#/components/schemas/FormBlock' },
          { $ref: '#/components/schemas/MarkdownBlock' },
        ],
      },
      ChartBlock: {
        type: 'object',
        required: ['type', 'collection', 'chartType', 'dimension', 'measure'],
        properties: {
          type: { type: 'string', enum: ['chart'] },
          collection: { type: 'string' },
          chartType: { type: 'string', enum: ['pie', 'bar', 'line', 'area'] },
          dimension: { type: 'string', description: 'X-axis or category field' },
          measure: {
            type: 'object',
            required: ['field', 'aggregation'],
            properties: {
              field: { type: 'string' },
              aggregation: { type: 'string', enum: ['count', 'sum', 'avg', 'min', 'max'] },
            },
          },
          options: {
            type: 'object',
            properties: {
              legend: { type: 'boolean' },
              tooltip: { type: 'boolean' },
            },
          },
        },
      },
      DetailsBlock: {
        type: 'object',
        required: ['type', 'collection', 'fields'],
        properties: {
          type: { type: 'string', enum: ['details'] },
          collection: { type: 'string' },
          fields: {
            type: 'array',
            items: {
              oneOf: [
                { type: 'string', description: 'Field name (shorthand)' },
                { $ref: '#/components/schemas/FieldConfig' },
              ],
            },
          },
          actions: {
            type: 'array',
            items: { type: 'string', enum: ['edit', 'delete'] },
          },
        },
      },
      FormBlock: {
        type: 'object',
        required: ['type', 'collection', 'fields'],
        properties: {
          type: { type: 'string', enum: ['form'] },
          collection: { type: 'string' },
          fields: {
            type: 'array',
            items: {
              oneOf: [
                { type: 'string', description: 'Field name (shorthand)' },
                { $ref: '#/components/schemas/FormFieldConfig' },
              ],
            },
          },
          actions: {
            type: 'array',
            items: { type: 'string', enum: ['edit', 'delete'] },
          },
        },
      },
      FieldConfig: {
        type: 'object',
        required: ['field'],
        properties: {
          field: { type: 'string' },
          span: { type: 'integer', description: 'Grid span out of 24' },
        },
      },
      FormFieldConfig: {
        type: 'object',
        required: ['field'],
        properties: {
          field: { type: 'string' },
          required: { type: 'boolean' },
          placeholder: { type: 'string' },
        },
      },
      MarkdownBlock: {
        type: 'object',
        required: ['type', 'content'],
        properties: {
          type: { type: 'string', enum: ['markdown'] },
          content: { type: 'string' },
        },
      },
      CreateRequest: {
        allOf: [
          { $ref: '#/components/schemas/Recipe' },
          {
            type: 'object',
            properties: {
              force: {
                type: 'boolean',
                default: false,
                description: 'If true, deletes existing page first if it exists at the same path',
              },
            },
          },
        ],
      },
      CreateResponse: {
        type: 'object',
        properties: {
          routeId: { type: 'integer', description: 'ID of the created route entry in desktopRoutes' },
          pageUid: { type: 'string', description: 'UID of the created RootPageModel flowModel' },
          blocksCreated: { type: 'integer', description: 'Number of flowModels created' },
          path: { type: 'string', description: 'Full route path of the created page' },
        },
        example: {
          routeId: 123,
          pageUid: 'abc123xyz45',
          blocksCreated: 15,
          path: 'EngOps/Workstations',
        },
      },
      DeleteRequest: {
        type: 'object',
        required: ['path'],
        properties: {
          path: { type: 'string', description: 'Route path of the page to delete' },
        },
        example: { path: 'EngOps/Workstations' },
      },
      DeleteResponse: {
        type: 'object',
        properties: {
          deleted: { type: 'boolean' },
          path: { type: 'string' },
          message: { type: 'string' },
        },
        example: {
          deleted: true,
          path: 'EngOps/Workstations',
          message: 'Page deleted: EngOps/Workstations',
        },
      },
      ExportResponse: {
        allOf: [
          { $ref: '#/components/schemas/Recipe' },
          {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Route path of the exported page' },
            },
          },
        ],
      },
      ExportAllResponse: {
        type: 'object',
        properties: {
          version: { type: 'string' },
          exportedAt: { type: 'string', format: 'date-time' },
          pages: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                recipe: { $ref: '#/components/schemas/Recipe' },
                error: { type: 'string' },
              },
            },
          },
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
        summary: 'Create page from Recipe',
        description:
          'Creates a new UI page from a Recipe JSON configuration. The Recipe defines the page structure, layout, blocks, and collection mappings in a human-readable format.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateRequest' },
            },
          },
        },
        responses: {
          200: {
            description: 'Page created successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateResponse' },
              },
            },
          },
          400: {
            description: 'Invalid Recipe format',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          409: {
            description: 'Page already exists (use force=true to overwrite)',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/ui-snapshot:delete': {
      post: {
        tags: ['ui-snapshot'],
        summary: 'Delete page by path',
        description: 'Deletes a UI page and all its associated flowModels by route path.',
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
            description: 'Page deleted successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DeleteResponse' },
              },
            },
          },
          404: {
            description: 'Page not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/ui-snapshot:export': {
      get: {
        tags: ['ui-snapshot'],
        summary: 'Export page to Recipe',
        description: 'Exports a single UI page to Recipe format. The exported Recipe can be used to recreate the page.',
        parameters: [
          {
            name: 'path',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'Route path of the page to export (e.g., "EngOps/Workstations")',
          },
        ],
        responses: {
          200: {
            description: 'Page exported successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ExportResponse' },
              },
            },
          },
          404: {
            description: 'Page not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/ui-snapshot:exportAll': {
      get: {
        tags: ['ui-snapshot'],
        summary: 'Export all pages',
        description: 'Exports all UI pages to Recipe format. Useful for backups or migration.',
        responses: {
          200: {
            description: 'All pages exported successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ExportAllResponse' },
              },
            },
          },
        },
      },
    },
  },
};
