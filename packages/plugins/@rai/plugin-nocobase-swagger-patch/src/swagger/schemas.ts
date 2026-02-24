/**
 * OpenAPI schema definitions for NocoBase collections and fields
 */

export const CollectionModel = {
  type: 'object',
  properties: {
    key: {
      type: 'string',
      description: 'Unique identifier (UID)',
    },
    name: {
      type: 'string',
      description: 'Internal identifier used as filterTargetKey',
    },
    title: {
      type: 'string',
      description: 'Display name',
    },
    inherit: {
      type: 'boolean',
      description: 'Whether the collection inherits from a parent',
    },
    hidden: {
      type: 'boolean',
      description: 'Whether the collection is hidden from UI',
    },
    options: {
      type: 'object',
      description: 'Collection options',
    },
    description: {
      type: 'string',
      nullable: true,
      description: 'Collection description',
    },
    unavailableActions: {
      type: 'array',
      items: { type: 'string' },
      description: 'List of disabled actions',
    },
    filterTargetKey: {
      type: 'string',
      description: 'Primary key field name',
    },
  },
};

export const CollectionModelWithFields = {
  allOf: [
    { $ref: '#/components/schemas/CollectionModel' },
    {
      type: 'object',
      properties: {
        fields: {
          type: 'array',
          items: { $ref: '#/components/schemas/FieldModel' },
          description: 'Collection fields',
        },
      },
    },
  ],
};

export const FieldModel = {
  type: 'object',
  properties: {
    key: {
      type: 'string',
      description: 'Unique identifier (UID), used as filterTargetKey',
    },
    name: {
      type: 'string',
      description: 'Field name',
    },
    type: {
      type: 'string',
      description: 'Database field type',
      enum: [
        'string',
        'text',
        'integer',
        'bigInt',
        'float',
        'double',
        'decimal',
        'boolean',
        'date',
        'dateonly',
        'time',
        'password',
        'uuid',
        'json',
        'jsonb',
        'array',
        'virtual',
        'belongsTo',
        'hasMany',
        'hasOne',
        'belongsToMany',
        'formula',
        'sequence',
        'sort',
        'markdown',
        'richText',
      ],
    },
    interface: {
      type: 'string',
      description: 'UI interface type',
    },
    description: {
      type: 'string',
      nullable: true,
      description: 'Field description',
    },
    collectionName: {
      type: 'string',
      description: 'Parent collection name',
    },
    options: {
      type: 'object',
      description: 'Field-specific options',
      properties: {
        unique: {
          type: 'boolean',
          description: 'Whether the field value must be unique',
        },
        defaultValue: {
          description: 'Default value for the field',
        },
        required: {
          type: 'boolean',
          description: 'Whether the field is required',
        },
      },
    },
  },
};

export const FieldCreateInput = {
  type: 'object',
  required: ['name', 'type'],
  properties: {
    name: {
      type: 'string',
      description: 'Field name',
    },
    type: {
      type: 'string',
      description: 'Database field type',
    },
    interface: {
      type: 'string',
      description: 'UI interface type',
    },
    description: {
      type: 'string',
      description: 'Field description',
    },
    options: {
      type: 'object',
      properties: {
        unique: { type: 'boolean' },
        defaultValue: {},
        required: { type: 'boolean' },
      },
    },
    reverseField: {
      type: 'object',
      description: 'Reverse field configuration for relation fields',
      properties: {
        name: { type: 'string' },
      },
    },
  },
};

export const CollectionCreateInput = {
  type: 'object',
  required: ['name'],
  properties: {
    name: {
      type: 'string',
      description: 'Internal identifier',
    },
    title: {
      type: 'string',
      description: 'Display name',
    },
    inherit: {
      type: 'boolean',
      default: false,
    },
    hidden: {
      type: 'boolean',
      default: false,
    },
    description: {
      type: 'string',
    },
    autoGenId: {
      type: 'boolean',
      default: true,
      description: 'Auto-generate ID field',
    },
    sortable: {
      type: 'boolean',
      default: false,
    },
    timestamps: {
      type: 'boolean',
      default: true,
    },
    createdAt: {
      type: 'boolean',
      default: true,
    },
    createdBy: {
      type: 'boolean',
      default: true,
    },
    updatedAt: {
      type: 'boolean',
      default: true,
    },
    updatedBy: {
      type: 'boolean',
      default: true,
    },
    fields: {
      type: 'array',
      items: { $ref: '#/components/schemas/FieldCreateInput' },
    },
  },
};

export const PaginatedResponse = {
  type: 'object',
  properties: {
    data: {
      type: 'array',
      items: {},
    },
    meta: {
      type: 'object',
      properties: {
        count: {
          type: 'integer',
          description: 'Total count of items',
        },
        page: {
          type: 'integer',
          description: 'Current page number',
        },
        pageSize: {
          type: 'integer',
          description: 'Items per page',
        },
        totalPage: {
          type: 'integer',
          description: 'Total number of pages',
        },
      },
    },
  },
};

export const ErrorResponse = {
  type: 'object',
  properties: {
    errors: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'Error message',
          },
        },
      },
    },
  },
};

export const MoveRequestBody = {
  type: 'object',
  properties: {
    sourceId: {
      type: 'string',
      description: 'ID of the item to move',
    },
    targetId: {
      type: 'string',
      description: 'ID of the target position',
    },
    targetScope: {
      type: 'string',
      description: 'Collection name for scoped moves',
    },
    sticky: {
      type: 'boolean',
      description: 'Whether to stick to top',
    },
    method: {
      type: 'string',
      enum: ['insertAfter', 'insertBefore'],
      description: 'Insertion method',
    },
  },
};

export default {
  CollectionModel,
  CollectionModelWithFields,
  FieldModel,
  FieldCreateInput,
  CollectionCreateInput,
  PaginatedResponse,
  ErrorResponse,
  MoveRequestBody,
};
