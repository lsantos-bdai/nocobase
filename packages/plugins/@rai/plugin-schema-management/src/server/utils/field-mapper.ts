import { Field } from '@nocobase/database';

interface OpenAPIPropertySchema {
  type?: string;
  format?: string;
  description?: string;
  enum?: string[];
  items?: { type: string };
  default?: any;
  nullable?: boolean;
  readOnly?: boolean;
}

/**
 * Maps a NocoBase field to an OpenAPI property schema
 */
export function mapFieldToOpenAPI(field: Field): OpenAPIPropertySchema | null {
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
    schema.items = { type: 'string' };
    const enumValues = uiSchema.enum || options.enum;
    if (enumValues && Array.isArray(enumValues)) {
      const values = enumValues.map((e: any) => (typeof e === 'object' ? e.value : e)).join(', ');
      schema.description = schema.description
        ? `${schema.description}. Allowed values: ${values}`
        : `Allowed values: ${values}`;
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
    case 'uid':
      schema.type = 'string';
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
    case 'jsonb':
      schema.type = 'object';
      break;

    case 'array':
    case 'set':
      schema.type = 'array';
      schema.items = { type: 'string' };
      break;

    // Relation types - represent as ID references
    case 'belongsTo':
    case 'hasOne':
      schema.type = 'integer';
      schema.description = schema.description
        ? `${schema.description} (reference to ${options.target || 'related record'})`
        : `Reference to ${options.target || 'related record'}`;
      break;

    case 'hasMany':
    case 'belongsToMany':
      schema.type = 'array';
      schema.items = { type: 'integer' };
      schema.description = schema.description
        ? `${schema.description} (references to ${options.target || 'related records'})`
        : `References to ${options.target || 'related records'}`;
      break;

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
      schema.format = 'int64';
      schema.readOnly = true;
      break;

    // Formula (computed field)
    case 'formula':
      const formulaDataType = options.dataType;
      if (formulaDataType === 'boolean') {
        schema.type = 'boolean';
      } else if (formulaDataType === 'integer' || formulaDataType === 'bigInt') {
        schema.type = 'integer';
      } else if (formulaDataType === 'double' || formulaDataType === 'decimal') {
        schema.type = 'number';
      } else {
        schema.type = 'string';
      }
      schema.readOnly = true;
      schema.description = schema.description
        ? `${schema.description} (computed)`
        : 'Computed formula field';
      break;

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
    case 'updatedBy':
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

    // Default fallback
    default:
      schema.type = 'string';
      break;
  }

  handleNullableAndDefault(schema, options);
  return schema;
}

/**
 * Handle nullable and default value properties
 */
function handleNullableAndDefault(schema: OpenAPIPropertySchema, options: any): void {
  // Handle default value
  if (options.defaultValue !== undefined) {
    schema.default = options.defaultValue;
  }

  // Handle nullable
  if (options.allowNull === true) {
    schema.nullable = true;
  }
}

/**
 * Normalizes a field name for OpenAPI output
 * Uses the field's internal name for stability in API consumers
 */
export function normalizeFieldName(name: string, title?: string): string {
  return name;
}
