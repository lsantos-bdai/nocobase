export default {
  info: {
    title: 'NocoBase API - Schema Management plugin',
  },
  tags: [{ name: 'schema-management', description: 'Collection schema and data import/export/migration' }],
  paths: {
    '/schema-management:listCollections': {
      get: {
        tags: ['schema-management'],
        summary: 'List collections available for schema operations',
        description:
          'Returns user-defined collections that have proper titles (filters out internal/junction tables). Sorted alphabetically by title.',
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
                      name: { type: 'string', description: 'Internal collection name', example: 'ArmStation' },
                      title: { type: 'string', description: 'Human-readable title', example: 'Arm Station' },
                      fieldCount: { type: 'integer', description: 'Number of fields', example: 12 },
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
        summary: 'Generate OpenAPI YAML schema for a collection',
        description:
          'Generates an OpenAPI 3.1.0 specification in YAML for a collection. Accepts the internal collection name or human-readable title. Use this output as input to the import or migrate endpoints.\n\nRelation fields include migration metadata:\n- `x-target-collection`: internal collection name of the relation target (e.g. `t_xxx`)\n- `x-foreign-key`: internal FK column name (e.g. `f_xxx`)\n- `x-other-key`: (belongsToMany only) other FK column in the junction table\n- `x-through`: (belongsToMany only) junction table name',
        parameters: [
          {
            name: 'collection',
            in: 'query',
            required: true,
            schema: { type: 'string', example: 'Arm Station' },
            description: 'Internal collection name or human-readable title.',
          },
        ],
        responses: {
          200: {
            description:
              'OpenAPI 3.1.0 YAML. Download with: `curl "http://localhost:13000/api/schema-management:generate?collection=ArmStation" > ArmStation.yaml`',
            content: {
              'text/yaml': {
                schema: { type: 'string' },
                example: `openapi: '3.1.0'
info:
  title: Arm Station
  version: 1.0.0
components:
  schemas:
    Arm Station:
      type: object
      x-title-field: name
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
        workstation:
          description: Work Station
          type: string
          x-belongs-to: WorkStation
          x-target-collection: t_9dx8b5vb55b
          x-foreign-key: f_l1rztrt2cwq
        cameras:
          description: Cameras
          type: array
          items:
            type: string
          x-belongs-to-many: Camera
          x-target-collection: t_zldxcwpdr9g
          x-foreign-key: f_abc123def
          x-other-key: f_def456abc
          x-through: t_junction789
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
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: { errors: [{ message: 'collection parameter is required' }] },
              },
            },
          },
          404: {
            description: 'Collection not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: { errors: [{ message: "Collection 'Unknown' not found" }] },
              },
            },
          },
        },
      },
    },

    '/schema-management:import': {
      post: {
        tags: ['schema-management'],
        summary: 'Create a collection from an OpenAPI YAML spec',
        description:
          'Creates a new collection and its fields from an OpenAPI YAML spec. Automatically adds preset fields (createdAt, updatedAt, createdBy, updatedBy). Fails if the collection already exists or if relation target collections are missing.\n\nRelation fields in the spec may include migration metadata (`x-target-collection`, `x-foreign-key`, `x-other-key`, `x-through`) to preserve exact internal names from the source server. When present, these override the auto-generated names that NocoBase would otherwise assign.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['spec'],
                properties: {
                  spec: { type: 'string', description: 'OpenAPI YAML spec string' },
                  collectionName: {
                    type: 'string',
                    description:
                      'Optional: explicit internal collection name to use (e.g. "t_abc123"). If omitted, NocoBase auto-generates one. Useful when migrating between servers to preserve the original collection name so data backups and UI snapshots remain valid.',
                    example: 't_9dx8b5vb55b',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Import result',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/SchemaImportResult' } },
            },
          },
          400: {
            description: 'Invalid spec or collection already exists',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },

    '/schema-management:diff': {
      post: {
        tags: ['schema-management'],
        summary: 'Compare current schema against a proposed new spec',
        description:
          'Generates the current spec for a collection, diffs it against the provided new spec, and classifies each change as breaking or non-breaking. Also validates whether existing data would survive each breaking change (e.g. counts NULL values before making a field required). Use this to preview changes before calling migrate.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['collection', 'spec'],
                properties: {
                  collection: {
                    type: 'string',
                    description: 'Internal collection name or human-readable title.',
                    example: 'Arm Station',
                  },
                  spec: {
                    type: 'string',
                    description: 'New OpenAPI YAML spec to compare against the current schema.',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Diff result with classified changes and data validation warnings.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DiffResponse' },
                example: {
                  currentSpec: 'openapi: 3.1.0\n...',
                  changes: {
                    nonBreaking: [
                      { type: 'add_field', field: 'firmware_version', description: 'New field added' },
                    ],
                    breaking: [
                      { type: 'make_required', field: 'serial_number', description: 'Field made required — 3 rows have NULL values' },
                    ],
                    unclassified: [],
                  },
                  validationWarnings: [
                    { type: 'null_values', field: 'serial_number', message: '3 rows have NULL values', count: 3 },
                  ],
                  canAutoApply: false,
                },
              },
            },
          },
          400: { description: 'Missing collection or spec parameter', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          404: { description: 'Collection not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },

    '/schema-management:migrate': {
      post: {
        tags: ['schema-management'],
        summary: 'Apply schema changes to an existing collection',
        description:
          'Applies the diff between the current schema and the provided spec. Non-breaking changes (add field, relax nullability, add enum, etc.) can be applied directly. Breaking changes (remove field, change type, make required, remove enum, add unique) require a `data` payload containing JSONL records to update — the server validates the data against the new constraints before applying.\n\n**Workflow for breaking changes:**\n1. Call `diff` to preview changes and see which rows have invalid data.\n2. Download data with `exportGet`, fix the records offline.\n3. Call `migrate` with the corrected JSONL in the `data` field.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['collection', 'spec'],
                properties: {
                  collection: {
                    type: 'string',
                    description: 'Internal collection name or human-readable title.',
                    example: 'Arm Station',
                  },
                  spec: {
                    type: 'string',
                    description: 'New OpenAPI YAML spec to migrate to.',
                  },
                  data: {
                    type: 'string',
                    description:
                      'JSONL string of replacement records required when breaking changes are present. Each line is a JSON object with an `id` field. Records are updated by ID; fields not present in the new spec are dropped.',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Migration result.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/MigrateResponse' },
                example: {
                  success: true,
                  fieldsAdded: ['firmware_version'],
                  fieldsModified: ['serial_number'],
                  fieldsSkipped: [],
                  errors: [],
                  warnings: [],
                  dataImport: { recordsImported: 42, recordsUpdated: 42 },
                },
              },
            },
          },
          400: {
            description: 'Breaking changes present but no data provided, or data fails validation.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: {
                  errors: [{ message: 'Breaking changes require data: make_required on serial_number (3 rows have NULL values)' }],
                },
              },
            },
          },
          404: { description: 'Collection not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },

    '/schema-management:export': {
      post: {
        tags: ['schema-management'],
        summary: 'Export collection data as JSON Lines (POST)',
        description:
          'Streams all records from a collection as newline-delimited JSON (JSONL / ndjson). Optionally restrict to a subset of fields. Each line in the response is a complete JSON object. Use this to back up data before applying breaking schema changes.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['collection'],
                properties: {
                  collection: {
                    type: 'string',
                    description: 'Internal collection name or human-readable title.',
                    example: 'Arm Station',
                  },
                  fields: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Optional subset of fields to include. Omit to export all fields.',
                    example: ['id', 'name', 'serial_number'],
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Streamed JSONL. Each line is a JSON record. The response Content-Disposition sets a filename.',
            content: {
              'application/x-ndjson': {
                schema: { type: 'string' },
                example: '{"id":1,"name":"Station A","serial_number":"SN001"}\n{"id":2,"name":"Station B","serial_number":"SN002"}\n',
              },
            },
          },
          400: { description: 'Missing collection or unknown field names', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          404: { description: 'Collection not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },

    '/schema-management:exportGet': {
      get: {
        tags: ['schema-management'],
        summary: 'Export collection data as JSON Lines (GET)',
        description:
          'GET version of the data export — easier to use with curl or browser download. Same streaming JSONL response as the POST export endpoint.\n\n```bash\ncurl "http://localhost:13000/api/schema-management:exportGet?collection=ArmStation" \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -o ArmStation-export.jsonl\n```',
        parameters: [
          {
            name: 'collection',
            in: 'query',
            required: true,
            schema: { type: 'string', example: 'Arm Station' },
            description: 'Internal collection name or human-readable title.',
          },
          {
            name: 'fields',
            in: 'query',
            required: false,
            schema: { type: 'string', example: 'id,name,serial_number' },
            description: 'Comma-separated list of field names to include. Omit for all fields.',
          },
        ],
        responses: {
          200: {
            description: 'Streamed JSONL attachment.',
            content: {
              'application/x-ndjson': {
                schema: { type: 'string' },
                example: '{"id":1,"name":"Station A"}\n{"id":2,"name":"Station B"}\n',
              },
            },
          },
          400: { description: 'Missing collection or unknown field names', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          404: { description: 'Collection not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },

    '/schema-management:importData': {
      post: {
        tags: ['schema-management'],
        summary: 'Import JSON Lines data into a collection',
        description:
          'Parses newline-delimited JSON and inserts or upserts records into an existing collection.\n\n- **insert mode** (default): Creates every record as new, ignoring any existing `id`.\n- **upsert mode**: If a record has an `id` that already exists, updates that row. Otherwise inserts a new row.\n\nProcesses records in batches of 100. Returns per-record counts and up to 10 error messages.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['collection', 'data'],
                properties: {
                  collection: {
                    type: 'string',
                    description: 'Internal collection name or human-readable title.',
                    example: 'Arm Station',
                  },
                  data: {
                    type: 'string',
                    description: 'Newline-delimited JSON string. Each non-empty line must be a valid JSON object.',
                    example: '{"id":1,"name":"Station A","serial_number":"SN001"}\n{"id":2,"name":"Station B","serial_number":"SN002"}',
                  },
                  mode: {
                    type: 'string',
                    enum: ['insert', 'upsert'],
                    default: 'insert',
                    description: '`insert` — always create new records. `upsert` — update by `id` if exists, otherwise insert.',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Import result.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DataImportResult' },
                example: {
                  success: true,
                  recordsInserted: 38,
                  recordsUpdated: 4,
                  recordsSkipped: 0,
                  errors: [],
                  warnings: [],
                },
              },
            },
          },
          400: { description: 'Missing collection or data parameter', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          404: { description: 'Collection not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
  },

  components: {
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          errors: {
            type: 'array',
            items: {
              type: 'object',
              properties: { message: { type: 'string' } },
            },
          },
        },
      },

      SchemaImportResult: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          collection: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Internal collection name' },
              title: { type: 'string', description: 'Human-readable title' },
            },
          },
          fieldsCreated: { type: 'array', items: { type: 'string' }, description: 'Field names that were created' },
          fieldsSkipped: { type: 'array', items: { type: 'string' }, description: 'Field names that were skipped (e.g. system fields)' },
          warnings: { type: 'array', items: { type: 'string' } },
          errors: { type: 'array', items: { type: 'string' } },
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

      ClassifiedChange: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            description: 'Change type',
            enum: [
              'add_field', 'remove_field', 'modify_field', 'change_type', 'change_relation',
              'make_required', 'make_optional', 'add_enum', 'remove_enum',
              'change_validation', 'add_unique', 'remove_unique', 'change_metadata',
              'change_collection_title',
            ],
          },
          field: { type: 'string', description: 'Field name this change applies to' },
          description: { type: 'string', description: 'Human-readable description of the change' },
          details: { type: 'object', description: 'Additional change details (old/new values, etc.)' },
        },
      },

      ClassifiedChanges: {
        type: 'object',
        properties: {
          nonBreaking: {
            type: 'array',
            items: { $ref: '#/components/schemas/ClassifiedChange' },
            description: 'Safe changes that can be applied without data migration.',
          },
          breaking: {
            type: 'array',
            items: { $ref: '#/components/schemas/ClassifiedChange' },
            description: 'Dangerous changes that may destroy or corrupt data. Require a data payload to proceed.',
          },
          unclassified: {
            type: 'array',
            items: { $ref: '#/components/schemas/ClassifiedChange' },
            description: 'Changes that could not be classified automatically.',
          },
        },
      },

      ValidationWarning: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['null_values', 'duplicates', 'invalid_enum', 'referenced_data'],
            description: 'Category of data problem detected.',
          },
          field: { type: 'string', description: 'Field name with the problem' },
          message: { type: 'string', description: 'Human-readable description' },
          count: { type: 'integer', description: 'Number of affected rows' },
          samples: { type: 'array', items: {}, description: 'Sample problematic values (up to 5)' },
        },
      },

      DiffResponse: {
        type: 'object',
        properties: {
          currentSpec: { type: 'string', description: 'Current OpenAPI YAML spec of the collection (for reference)' },
          changes: { $ref: '#/components/schemas/ClassifiedChanges' },
          validationWarnings: {
            type: 'array',
            items: { $ref: '#/components/schemas/ValidationWarning' },
            description: 'Data-level problems that would block migration (e.g. NULL rows that would violate a new required constraint).',
          },
          canAutoApply: {
            type: 'boolean',
            description: 'True if all changes are non-breaking and no data migration is needed.',
          },
        },
      },

      MigrateResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          fieldsAdded: { type: 'array', items: { type: 'string' }, description: 'Names of newly created fields' },
          fieldsModified: { type: 'array', items: { type: 'string' }, description: 'Names of updated fields' },
          fieldsSkipped: { type: 'array', items: { type: 'string' }, description: 'Names of fields skipped (system fields, etc.)' },
          errors: { type: 'array', items: { type: 'string' } },
          warnings: { type: 'array', items: { type: 'string' } },
          dataImport: {
            type: 'object',
            description: 'Present when a data payload was provided.',
            properties: {
              recordsImported: { type: 'integer' },
              recordsUpdated: { type: 'integer' },
            },
          },
        },
      },

      DataImportResult: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          recordsInserted: { type: 'integer' },
          recordsUpdated: { type: 'integer' },
          recordsSkipped: { type: 'integer', description: 'Records that could not be imported due to errors' },
          errors: { type: 'array', items: { type: 'string' }, description: 'Up to 10 per-record error messages' },
          warnings: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};
