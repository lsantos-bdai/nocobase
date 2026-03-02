import { Field } from '@nocobase/database';

interface OpenAPIPropertySchema {
  type?: string;
  format?: string;
  description?: string;
  enum?: string[];
  items?: { type: string; enum?: string[] };
  default?: any;
  readOnly?: boolean;
  'x-belongs-to'?: string;
  'x-has-one'?: string;
  'x-has-many'?: string;
  'x-belongs-to-many'?: string;
  'x-nocobase-type'?: string;
  'x-unique'?: boolean;
  'x-expression'?: string;
}

export interface FieldMapperContext {
  collectionTitleMap: Map<string, string>; // internal name -> title
}

/**
 * Maps a NocoBase field to an OpenAPI property schema
 */
export function mapFieldToOpenAPI(field: Field, context?: FieldMapperContext): OpenAPIPropertySchema | null {
  const options = field.options || {};
  const fieldType = field.type;
  const fieldInterface = options.interface;
  const uiSchema = options.uiSchema || {};

  // Skip virtual/computed fields that don't have storage
  if (options.virtual && !options.get) {
    return null;
  }

  // Skip hidden fields
  if (options.hidden) {
    return null;
  }

  // Skip internal foreign key fields (f_* columns created by NocoBase for relations)
  if (options.isForeignKey) {
    return null;
  }

  const schema: OpenAPIPropertySchema = {};

  // Add description from uiSchema.title or options.title
  const title = uiSchema.title || options.title;
  if (title && title !== field.name) {
    schema.description = title;
  }

  // Handle by interface first for select/enum fields
  if (fieldInterface === 'select' || fieldInterface === 'radioGroup') {
    schema.type = 'string';
    const enumValues = uiSchema.enum || options.enum;
    if (enumValues && Array.isArray(enumValues)) {
      schema.enum = enumValues.map((e: any) => (typeof e === 'object' ? e.value : e));
    }
    handleNullableAndDefault(schema, options);
    return schema;
  }

  if (fieldInterface === 'multipleSelect' || fieldInterface === 'checkboxGroup') {
    schema.type = 'array';
    const enumValues = uiSchema.enum || options.enum;
    if (enumValues && Array.isArray(enumValues)) {
      const values = enumValues.map((e: any) => (typeof e === 'object' ? e.value : e));
      schema.items = { type: 'string', enum: values };
    } else {
      schema.items = { type: 'string' };
    }
    handleNullableAndDefault(schema, options);
    return schema;
  }

  // Map field type to OpenAPI type/format
  switch (fieldType) {
    // Integer types
    case 'integer':
      schema.type = 'integer';
      break;

    case 'bigInt':
      schema.type = 'integer';
      schema.format = 'int64';
      break;

    // Floating point types
    case 'float':
      schema.type = 'number';
      schema.format = 'float';
      break;

    case 'double':
      schema.type = 'number';
      schema.format = 'double';
      break;

    case 'real':
    case 'decimal':
      schema.type = 'number';
      break;

    // String types
    case 'string':
    case 'text':
      schema.type = 'string';
      break;

    case 'uid':
      schema.type = 'string';
      schema['x-nocobase-type'] = 'uid';
      break;

    case 'uuid':
      schema.type = 'string';
      schema.format = 'uuid';
      break;

    case 'nanoid':
      schema.type = 'string';
      break;

    // Boolean
    case 'boolean':
      schema.type = 'boolean';
      break;

    // Date/time types - check interface for more specific handling
    case 'date':
      schema.type = 'string';
      // Check interface to determine if it's a datetime or date-only
      if (fieldInterface === 'createdAt' || fieldInterface === 'updatedAt') {
        schema.format = 'date-time';
        schema.readOnly = true;
      } else if (fieldInterface === 'datetime') {
        schema.format = 'date-time';
      } else {
        // date interface or unspecified - use date format
        schema.format = 'date';
      }
      break;

    case 'dateOnly':
      schema.type = 'string';
      schema.format = 'date';
      break;

    case 'time':
      schema.type = 'string';
      schema.format = 'time';
      break;

    case 'datetime':
    case 'datetimeTz':
    case 'datetimeNoTz':
      schema.type = 'string';
      schema.format = 'date-time';
      break;

    // Unix timestamp (stored as integer)
    case 'unixTimestamp':
      schema.type = 'integer';
      schema.format = 'int64';
      schema.description = schema.description
        ? `${schema.description} (Unix timestamp)`
        : 'Unix timestamp';
      break;

    // Snowflake ID (too large for integer in some clients)
    case 'snowflakeId':
      schema.type = 'string';
      schema.description = schema.description
        ? `${schema.description} (Snowflake ID)`
        : 'Snowflake distributed ID';
      break;

    // JSON type
    case 'json':
      schema.type = 'object';
      break;

    case 'jsonb':
      schema.type = 'object';
      schema['x-nocobase-type'] = 'jsonb';
      break;

    case 'array':
    case 'set':
      schema.type = 'array';
      schema.items = { type: 'string' };
      break;

    // Relation types - use x-* extensions with human-readable target titles
    // Include type info so schema can validate JSON (string for single, array for many)
    case 'belongsTo': {
      const targetName = options.target || 'related record';
      const targetTitle = context?.collectionTitleMap?.get(targetName) || targetName;
      schema.type = 'string';
      schema['x-belongs-to'] = targetTitle;
      break;
    }

    case 'hasOne': {
      const targetName = options.target || 'related record';
      const targetTitle = context?.collectionTitleMap?.get(targetName) || targetName;
      schema.type = 'string';
      schema['x-has-one'] = targetTitle;
      break;
    }

    case 'hasMany': {
      const targetName = options.target || 'related records';
      const targetTitle = context?.collectionTitleMap?.get(targetName) || targetName;
      schema.type = 'array';
      schema.items = { type: 'string' };
      schema['x-has-many'] = targetTitle;
      break;
    }

    case 'belongsToMany': {
      const targetName = options.target || 'related records';
      const targetTitle = context?.collectionTitleMap?.get(targetName) || targetName;
      schema.type = 'array';
      schema.items = { type: 'string' };
      schema['x-belongs-to-many'] = targetTitle;
      break;
    }

    // Rich text / markdown
    case 'richText':
      schema.type = 'string';
      schema.format = 'html';
      break;

    case 'markdown':
    case 'markdownVditor':
      schema.type = 'string';
      schema.format = 'markdown';
      break;

    // Password (write-only in practice)
    case 'password':
      schema.type = 'string';
      schema.format = 'password';
      break;

    // Encryption
    case 'encryption':
      schema.type = 'string';
      schema.format = 'password';
      break;

    // Email
    case 'email':
      schema.type = 'string';
      schema.format = 'email';
      break;

    // URL
    case 'url':
      schema.type = 'string';
      schema.format = 'uri';
      break;

    // Phone
    case 'phone':
      schema.type = 'string';
      break;

    // Percent
    case 'percent':
      schema.type = 'number';
      schema.description = schema.description
        ? `${schema.description} (percentage)`
        : 'Percentage value';
      break;

    // Sequence/auto-increment
    case 'sequence':
      schema.type = 'string';
      schema.readOnly = true;
      break;

    // Sort field
    case 'sort':
      schema.type = 'integer';
      schema['x-nocobase-type'] = 'sort';
      break;

    // Formula (computed field)
    case 'formula': {
      schema['x-nocobase-type'] = 'formula';
      if (options.expression) {
        schema['x-expression'] = options.expression;
      }
      break;
    }

    // Geographic types
    case 'circle':
    case 'point':
    case 'polygon':
    case 'lineString':
      schema.type = 'object';
      schema.description = schema.description
        ? `${schema.description} (GeoJSON ${fieldType})`
        : `GeoJSON ${fieldType}`;
      break;

    // Snapshot
    case 'snapshot':
      schema.type = 'object';
      schema.description = schema.description
        ? `${schema.description} (snapshot)`
        : 'Snapshot of related data';
      break;

    // Context fields (createdBy, updatedBy)
    case 'context':
    case 'createdBy':
    case 'updatedBy': {
      const contextDataType = options.dataType;
      if (contextDataType === 'integer' || contextDataType === 'bigint') {
        schema.type = 'integer';
      } else {
        schema.type = 'string';
      }
      schema.readOnly = true;
      schema.description = schema.description
        ? `${schema.description} (user ID)`
        : 'User ID';
      break;
    }

    // Virtual field
    case 'virtual':
      schema['x-nocobase-type'] = 'virtual';
      break;

    // Default fallback
    default:
      schema.type = 'string';
      break;
  }

  handleNullableAndDefault(schema, options);
  return schema;
}

/**
 * Handle default value and unique constraint properties
 * Note: We don't emit `nullable` - nullability is determined by the `required` array
 */
function handleNullableAndDefault(schema: OpenAPIPropertySchema, options: any): void {
  if (options.defaultValue !== undefined) {
    schema.default = options.defaultValue;
  }
  if (options.unique === true) {
    schema['x-unique'] = true;
  }
}

/**
 * Normalizes a field name for OpenAPI output
 * Uses the field's internal name for stability in API consumers
 */
export function normalizeFieldName(name: string, title?: string): string {
  return name;
}
