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
    title: 'NocoBase API - Schema Management plugin',
  },
  tags: [{ name: 'schema-management', description: 'Collection schema generation operations' }],
  paths: {
    '/schema-management:listCollections': {
      get: {
        tags: ['schema-management'],
        summary: 'List collections available for schema generation',
        description:
          'Returns collections that have proper user-defined titles (filters out internal/junction tables). Collections are sorted alphabetically by title.',
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
                      name: {
                        type: 'string',
                        description: 'Collection name',
                        example: 'ArmStation',
                      },
                      title: {
                        type: 'string',
                        description: 'Human-readable title',
                        example: 'Arm Station',
                      },
                      fieldCount: {
                        type: 'integer',
                        description: 'Number of fields in the collection',
                        example: 12,
                      },
                    },
                  },
                  example: [
                    { name: 'ArmStation', title: 'Arm Station', fieldCount: 12 },
                    { name: 'Robots', title: 'Robots', fieldCount: 8 },
                  ],
                },
              },
            },
          },
        },
      },
    },
    '/schema-management:generate': {
      get: {
        tags: ['schema-management'],
        summary: 'Generate OpenAPI schema for a collection',
        description:
          "Generates an OpenAPI 3.1.0 specification in YAML format containing the schema definition for a collection's fields. Field names are normalized from their titles to snake_case. The schema includes type mappings for all supported NocoBase field types.",
        parameters: [
          {
            name: 'collection',
            in: 'query',
            required: true,
            schema: { type: 'string', example: 'ArmStation' },
            description:
              'Collection identifier. Accepts either the internal collection name (e.g., "t_abc123xyz") or the human-readable title (e.g., "Arm Station").',
          },
        ],
        responses: {
          200: {
            description: 'OpenAPI 3.1.0 YAML specification. Use curl to download: `curl "http://localhost:13000/api/schema-management:generate?collection=ArmStation" > ArmStation.yaml`',
            content: {
              'text/yaml': {
                schema: {
                  type: 'string',
                },
                example: `openapi: '3.1.0'
info:
  title: Arm Station
  version: 1.0.0
components:
  schemas:
    Arm Station:
      type: object
      properties:
        name:
          type: string
        serial_number:
          type: string
        status:
          type: string
          enum:
            - active
            - inactive
      required:
        - id
        - name`,
              },
            },
          },
          400: {
            description: 'Missing collection parameter',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    errors: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          message: { type: 'string' },
                        },
                      },
                    },
                  },
                },
                example: {
                  errors: [{ message: 'collection parameter is required' }],
                },
              },
            },
          },
          404: {
            description: 'Collection not found',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    errors: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          message: { type: 'string' },
                        },
                      },
                    },
                  },
                },
                example: {
                  errors: [{ message: "Collection 'InvalidCollection' not found" }],
                },
              },
            },
          },
        },
      },
    },
    '/schema-management:import': {
      post: {
        tags: ['schema-management'],
        summary: 'Import OpenAPI spec to create a collection',
        description:
          'Creates a collection and its fields from an OpenAPI YAML spec. Automatically adds preset fields (createdAt, updatedAt, createdBy, updatedBy). Fails if the collection already exists or if dependencies (parent collections, relation targets) are missing.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['spec'],
                properties: {
                  spec: {
                    type: 'string',
                    description: 'OpenAPI YAML spec',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Import result with created collection and fields',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ImportResult',
                },
              },
            },
          },
          400: {
            description: 'Invalid spec or missing required fields',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    errors: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          message: { type: 'string' },
                        },
                      },
                    },
                  },
                },
                example: {
                  errors: [{ message: 'Invalid OpenAPI spec: missing info.title' }],
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      ImportResult: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            description: 'Whether the import was successful',
          },
          collection: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Internal collection name',
              },
              title: {
                type: 'string',
                description: 'Human-readable title',
              },
            },
          },
          fieldsCreated: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of field names that were created',
          },
          fieldsSkipped: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of field names that were skipped',
          },
          warnings: {
            type: 'array',
            items: { type: 'string' },
            description: 'Non-fatal warnings during import',
          },
          errors: {
            type: 'array',
            items: { type: 'string' },
            description: 'Error messages if import failed',
          },
        },
        example: {
          success: true,
          collection: { name: 't_abc123xyz', title: 'Arm Station' },
          fieldsCreated: ['name', 'serial_number', 'status'],
          fieldsSkipped: [],
          warnings: [],
          errors: [],
        },
      },
    },
  },
};
