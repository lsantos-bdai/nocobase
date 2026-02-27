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
      description: 'JSON-based UI page creation, export, and management',
    },
  ],
  components: {
    schemas: {
      CreateRequest: {
        type: 'object',
        description: 'Page configuration object with optional force flag',
        required: ['page', 'layout', 'blocks'],
        properties: {
          page: {
            type: 'object',
            required: ['title'],
            description: 'Page settings (title, icon, route)',
            properties: {
              title: { type: 'string', description: 'Page title displayed in navigation' },
              icon: { type: 'string', description: 'Ant Design icon name (e.g., "DesktopOutlined")' },
              route: { type: 'string', description: 'Route path (auto-generated from title if omitted)' },
            },
          },
          collections: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: 'Map of collection aliases to internal names (e.g., {"WorkStation": "t_9dx8b5vb55b"})',
          },
          layout: {
            type: 'object',
            required: ['rows'],
            description: 'Grid layout configuration',
            properties: {
              rows: {
                type: 'array',
                items: { $ref: '#/components/schemas/LayoutRow' },
              },
            },
          },
          blocks: {
            type: 'object',
            additionalProperties: { $ref: '#/components/schemas/BlockConfig' },
            description: 'Block configurations keyed by name',
          },
          force: {
            type: 'boolean',
            default: false,
            description: 'If true, deletes existing page first if it exists at the same path',
          },
        },
        example: {
          page: {
            title: 'Workstations',
            route: 'EngOps/Workstations',
          },
          collections: {
            WorkStation: 't_9dx8b5vb55b',
          },
          layout: {
            rows: [
              {
                columns: [
                  {
                    width: 24,
                    blocks: [{ $ref: '#/blocks/main_table' }],
                  },
                ],
              },
            ],
          },
          blocks: {
            main_table: {
              type: 'TableBlockModel',
              collection: 'WorkStation',
              columns: [
                { field: 'name', sortable: true },
                { field: 'status' },
              ],
            },
          },
          force: false,
        },
      },
      LayoutRow: {
        type: 'object',
        properties: {
          columns: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                width: { type: 'integer', minimum: 1, maximum: 24, description: 'Column width out of 24' },
                blocks: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      $ref: { type: 'string', description: 'Reference to block (e.g., "#/blocks/table1")' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      CreateResponse: {
        type: 'object',
        properties: {
          routeId: {
            type: 'integer',
            description: 'ID of the created route entry in desktopRoutes',
          },
          pageUid: {
            type: 'string',
            description: 'UID of the created RootPageModel flowModel',
          },
          blocksCreated: {
            type: 'integer',
            description: 'Number of blocks created',
          },
          path: {
            type: 'string',
            description: 'Full route path of the created page',
          },
        },
        example: {
          routeId: 123,
          pageUid: 'abc123xyz45',
          blocksCreated: 3,
          path: 'EngOps/Workstations',
        },
      },
      DeleteRequest: {
        type: 'object',
        required: ['path'],
        properties: {
          path: {
            type: 'string',
            description: 'Route path of the page to delete (e.g., "EngOps/Workstations")',
          },
        },
        example: {
          path: 'EngOps/Workstations',
        },
      },
      DeleteResponse: {
        type: 'object',
        properties: {
          deleted: {
            type: 'boolean',
            description: 'Whether the deletion was successful',
          },
          path: {
            type: 'string',
            description: 'Route path of the deleted page',
          },
          flowModelsDeleted: {
            type: 'integer',
            description: 'Number of flowModels deleted (page and all descendant blocks)',
          },
        },
        example: {
          deleted: true,
          path: 'EngOps/Workstations',
          flowModelsDeleted: 15,
        },
      },
      ExportResponse: {
        type: 'object',
        description: 'Exported page configuration with path',
        properties: {
          page: {
            type: 'object',
            description: 'Page settings (title, icon, route)',
            properties: {
              title: { type: 'string' },
              icon: { type: 'string' },
              route: { type: 'string' },
            },
          },
          collections: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: 'Map of collection aliases to internal names',
          },
          layout: {
            type: 'object',
            description: 'Grid layout configuration',
          },
          blocks: {
            type: 'object',
            additionalProperties: { $ref: '#/components/schemas/BlockConfig' },
            description: 'Block configurations keyed by name',
          },
          path: {
            type: 'string',
            description: 'Route path of the exported page',
          },
        },
        example: {
          page: { title: 'Workstations', route: 'EngOps/Workstations' },
          collections: { WorkStation: 't_9dx8b5vb55b' },
          layout: { rows: [{ columns: [{ width: 24, blocks: [{ $ref: '#/blocks/main_table' }] }] }] },
          blocks: {
            main_table: {
              type: 'TableBlockModel',
              collection: 'WorkStation',
              columns: [{ field: 'name' }, { field: 'status' }],
            },
          },
          path: 'EngOps/Workstations',
        },
      },
      ExportAllResponse: {
        type: 'object',
        description: 'Full UI snapshot with all pages',
        properties: {
          version: {
            type: 'string',
            description: 'Snapshot format version',
          },
          exported_at: {
            type: 'string',
            format: 'date-time',
            description: 'Export timestamp',
          },
          collections: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: 'Global collection alias mappings',
          },
          pages: {
            type: 'array',
            description: 'Array of page configurations',
            items: {
              type: 'object',
              properties: {
                page: { $ref: '#/components/schemas/PageConfig' },
              },
            },
          },
          pageCount: {
            type: 'integer',
            description: 'Number of pages included in the export',
          },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          error: {
            type: 'string',
            description: 'Error type (e.g., "Validation failed", "Conflict", "Not found")',
          },
          message: {
            type: 'string',
            description: 'Detailed error message',
          },
        },
      },
      PageConfig: {
        type: 'object',
        description: 'JSON page configuration structure',
        required: ['page', 'layout', 'blocks'],
        properties: {
          page: {
            type: 'object',
            required: ['title'],
            properties: {
              title: { type: 'string', description: 'Page title displayed in navigation' },
              icon: { type: 'string', description: 'Ant Design icon name (e.g., "DesktopOutlined")' },
              route: { type: 'string', description: 'Route path (auto-generated from title if omitted)' },
            },
          },
          collections: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: 'Map of collection aliases to internal names (e.g., {"WorkStation": "t_9dx8b5vb55b"})',
          },
          layout: {
            type: 'object',
            required: ['rows'],
            properties: {
              rows: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    columns: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          width: { type: 'integer', minimum: 1, maximum: 24, description: 'Column width out of 24' },
                          blocks: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                $ref: { type: 'string', description: 'Reference to block (e.g., "#/blocks/table1")' },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          blocks: {
            type: 'object',
            additionalProperties: {
              $ref: '#/components/schemas/BlockConfig',
            },
          },
        },
      },
      BlockConfig: {
        type: 'object',
        description: 'Block configuration (TableBlockModel, ChartBlockModel, etc.)',
        properties: {
          type: {
            type: 'string',
            enum: ['TableBlockModel', 'ChartBlockModel', 'DetailsBlockModel', 'FormBlockModel', 'MarkdownBlockModel'],
            description: 'Block type',
          },
          collection: {
            type: 'string',
            description: 'Collection alias or internal name',
          },
        },
      },
      TableBlockConfig: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['TableBlockModel'] },
          collection: { type: 'string' },
          columns: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                field: { type: 'string', description: 'Field name' },
                sortable: { type: 'boolean' },
                width: { type: 'integer' },
                fixed: { type: 'string', enum: ['left', 'right'] },
              },
            },
          },
          actions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['filter', 'view', 'edit', 'delete', 'create', 'refresh', 'export'] },
              },
            },
          },
          pageSize: { type: 'integer', default: 20 },
        },
      },
      ChartBlockConfig: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['ChartBlockModel'] },
          collection: { type: 'string' },
          chart: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['pie', 'bar', 'line', 'area', 'scatter', 'dualAxes'] },
              dimension: { type: 'string', description: 'X-axis or category field' },
              measure: {
                type: 'object',
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
                  labelType: { type: 'string', enum: ['percent', 'value', 'both', 'none'] },
                },
              },
            },
          },
        },
      },
    },
  },
  paths: {
    '/ui-snapshot:create': {
      post: {
        tags: ['ui-snapshot'],
        summary: 'Create page from JSON',
        description:
          'Creates a new UI page from JSON configuration. The JSON defines the page structure, layout, blocks, and collection mappings. If the page already exists, the request fails unless force=true is specified.',
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
            description: 'Bad request - missing required page field',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: { error: 'Bad request', message: 'Missing required field: page' },
              },
            },
          },
          409: {
            description: 'Conflict - page already exists at the specified path',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: {
                  error: 'Conflict',
                  message: 'Page already exists at path: EngOps/Workstations. Use force=true to overwrite.',
                },
              },
            },
          },
          422: {
            description: 'Validation failed - JSON structure is invalid',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: {
                  error: 'Validation failed',
                  message: "JSON validation failed: Missing required field: page.title; Block 'table1': columns[0] requires 'field'",
                },
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
        description:
          'Deletes a UI page and all its associated flowModels by route path. The route path is the hierarchical navigation path (e.g., "EngOps/Workstations").',
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
          400: {
            description: 'Bad request - missing path field',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: { error: 'Bad request', message: 'Missing required field: path' },
              },
            },
          },
          404: {
            description: 'Page not found at the specified path',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: { error: 'Not found', message: 'Page not found at path: EngOps/Workstations' },
              },
            },
          },
        },
      },
    },
    '/ui-snapshot:export': {
      get: {
        tags: ['ui-snapshot'],
        summary: 'Export page to JSON',
        description:
          'Exports a single UI page to JSON format. The exported JSON can be used to recreate the page or serve as a template.',
        parameters: [
          {
            name: 'path',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'Route path of the page to export (e.g., "EngOps/Workstations")',
            example: 'EngOps/Workstations',
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
          400: {
            description: 'Bad request - missing path parameter',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          404: {
            description: 'Page not found at the specified path',
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
        description:
          'Exports the entire UI (all pages) to a single JSON snapshot. Useful for backups or migrating the UI to another instance.',
        responses: {
          200: {
            description: 'All pages exported successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ExportAllResponse' },
                example: {
                  version: '1.0',
                  exported_at: '2026-02-26T14:30:00.000Z',
                  collections: { Collection_abc: 't_abc123' },
                  pages: [{ page: { page: { title: 'Example' }, layout: { rows: [] }, blocks: {} } }],
                  pageCount: 1,
                },
              },
            },
          },
          500: {
            description: 'Export failed',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
  },
};
