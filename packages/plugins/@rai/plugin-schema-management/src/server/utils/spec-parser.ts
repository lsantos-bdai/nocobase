import * as yaml from 'js-yaml';

export interface SelectOption {
  label: string;
  value: string;
  color?: string;
}

export interface ValidationRule {
  key: string;
  name: string;
  args?: Record<string, unknown>;
  paramsType?: 'object';
}

export interface ValidationOptions {
  type: 'string' | 'number' | 'object';
  rules: ValidationRule[];
}

export interface FieldSchema {
  name: string;
  type: string;
  interface?: string;
  primaryKey?: boolean;
  allowNull?: boolean;
  unique?: boolean;
  defaultValue?: unknown;
  field?: string;
  target?: string;
  foreignKey?: string;
  /** Internal collection name of the relation target (e.g. t_xxx). Used during migration to preserve exact names. */
  targetCollection?: string;
  /** For belongsToMany: the other FK column in the junction table */
  otherKey?: string;
  /** For belongsToMany: the junction table name */
  through?: string;
  expression?: string;
  precision?: number;
  scale?: number;
  validation?: ValidationOptions;
  uiSchema?: {
    type?: string;
    title?: string;
    'x-component'?: string;
    'x-component-props'?: Record<string, unknown>;
    'x-read-pretty'?: boolean;
    enum?: SelectOption[];
  };
}

export interface CollectionSchema {
  title: string;
  fields: FieldSchema[];
  inherits?: string[];
  titleField?: string;
}

export interface ParsedSpec {
  schema: CollectionSchema;
  errors: string[];
  rawProperties: Record<string, any>;
}

function toTitle(name: string): string {
  return name
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

let ruleKeyCounter = 0;
function nextKey(): string {
  return `r_${Date.now()}_${ruleKeyCounter++}`;
}

/**
 * Build NocoBase JOI validation options from OpenAPI property constraints
 */
function buildValidation(prop: any, isRequired: boolean): ValidationOptions | undefined {
  // Determine JOI type based on OpenAPI type
  const joiType: 'string' | 'number' | 'object' =
    prop.type === 'integer' || prop.type === 'number'
      ? 'number'
      : prop.type === 'boolean' || prop.type === 'object' || prop.type === 'array'
        ? 'object'
        : 'string';

  const rules: ValidationRule[] = [];

  // Required (from OpenAPI required array)
  if (isRequired) {
    rules.push({ key: nextKey(), name: 'required', args: {} });
  }

  // String constraints
  if (prop.minLength !== undefined) {
    rules.push({ key: nextKey(), name: 'min', args: { limit: prop.minLength } });
  }
  if (prop.maxLength !== undefined) {
    rules.push({ key: nextKey(), name: 'max', args: { limit: prop.maxLength } });
  }
  if (prop.pattern !== undefined) {
    rules.push({ key: nextKey(), name: 'pattern', args: { regex: prop.pattern } });
  }

  // Number constraints
  if (prop.minimum !== undefined) {
    rules.push({ key: nextKey(), name: 'min', args: { limit: prop.minimum } });
  }
  if (prop.maximum !== undefined) {
    rules.push({ key: nextKey(), name: 'max', args: { limit: prop.maximum } });
  }
  if (prop.exclusiveMinimum !== undefined) {
    rules.push({ key: nextKey(), name: 'greater', args: { limit: prop.exclusiveMinimum } });
  }
  if (prop.exclusiveMaximum !== undefined) {
    rules.push({ key: nextKey(), name: 'less', args: { limit: prop.exclusiveMaximum } });
  }

  // Format-based validators (only for formats that have JOI equivalents)
  if (prop.format === 'email') {
    rules.push({ key: nextKey(), name: 'email', args: {}, paramsType: 'object' });
  }
  if (prop.format === 'uuid') {
    rules.push({ key: nextKey(), name: 'guid', args: {}, paramsType: 'object' });
  }
  if (prop.format === 'uri') {
    rules.push({ key: nextKey(), name: 'uri', args: {}, paramsType: 'object' });
  }

  // Array constraints
  if (prop.minItems !== undefined) {
    rules.push({ key: nextKey(), name: 'min', args: { limit: prop.minItems } });
  }
  if (prop.maxItems !== undefined) {
    rules.push({ key: nextKey(), name: 'max', args: { limit: prop.maxItems } });
  }

  return rules.length > 0 ? { type: joiType, rules } : undefined;
}

export const PRESET_FIELDS: FieldSchema[] = [
  {
    name: 'createdAt',
    interface: 'createdAt',
    type: 'date',
    field: 'createdAt',
    allowNull: false,
    uiSchema: {
      type: 'datetime',
      title: 'Created at',
      'x-component': 'DatePicker',
      'x-component-props': {},
      'x-read-pretty': true,
    },
  },
  {
    name: 'createdBy',
    interface: 'createdBy',
    type: 'belongsTo',
    target: 'users',
    foreignKey: 'createdById',
    uiSchema: {
      type: 'object',
      title: 'Created by',
      'x-component': 'AssociationField',
      'x-component-props': { fieldNames: { value: 'id', label: 'nickname' } },
      'x-read-pretty': true,
    },
  },
  {
    name: 'updatedAt',
    interface: 'updatedAt',
    type: 'date',
    field: 'updatedAt',
    allowNull: false,
    uiSchema: {
      type: 'datetime',
      title: 'Last updated at',
      'x-component': 'DatePicker',
      'x-component-props': {},
      'x-read-pretty': true,
    },
  },
  {
    name: 'updatedBy',
    interface: 'updatedBy',
    type: 'belongsTo',
    target: 'users',
    foreignKey: 'updatedById',
    uiSchema: {
      type: 'object',
      title: 'Last updated by',
      'x-component': 'AssociationField',
      'x-component-props': { fieldNames: { value: 'id', label: 'nickname' } },
      'x-read-pretty': true,
    },
  },
];

/**
 * Parse an OpenAPI spec YAML string and convert to NocoBase collection schema
 */
export function parseOpenAPISpec(yamlContent: string): ParsedSpec {
  const errors: string[] = [];

  let doc: any;
  try {
    doc = yaml.load(yamlContent);
  } catch (e: any) {
    return { schema: { title: '', fields: [] }, errors: [`Invalid YAML: ${e.message}`], rawProperties: {} };
  }

  if (!doc?.components?.schemas) {
    return { schema: { title: '', fields: [] }, errors: ['Missing components.schemas in OpenAPI spec'], rawProperties: {} };
  }

  const schemaNames = Object.keys(doc.components.schemas);
  if (schemaNames.length === 0) {
    return { schema: { title: '', fields: [] }, errors: ['No schemas found in components.schemas'], rawProperties: {} };
  }

  const schemaName = schemaNames[0];
  const schemaObj = doc.components.schemas[schemaName];
  const rawInherits = schemaObj['x-inherits'];
  const inherits: string[] | undefined = rawInherits
    ? Array.isArray(rawInherits)
      ? rawInherits
      : [rawInherits]
    : undefined;
  const titleField: string | undefined = schemaObj['x-title-field'];
  const props = schemaObj.properties ?? {};

  // Parse required fields array
  const requiredFields = new Set<string>(schemaObj.required ?? []);

  // Validate that all required fields exist in properties
  const propNames = new Set(Object.keys(props));
  const invalidRequiredFields = [...requiredFields].filter((name) => !propNames.has(name));
  if (invalidRequiredFields.length > 0) {
    return {
      schema: { title: '', fields: [] },
      errors: [`Required field(s) not found in properties: ${invalidRequiredFields.map((f) => `"${f}"`).join(', ')}`],
      rawProperties: props,
    };
  }

  const fields: FieldSchema[] = Object.entries(props).map(([name, prop]: [string, any]) => {
    const title = prop.description || toTitle(name);
    const isRequired = requiredFields.has(name);
    const allowNull = !isRequired;
    const unique = prop['x-unique'] || false;
    const defaultValue = prop.default;
    const validation = buildValidation(prop, isRequired);

    // Build base field properties
    const baseProps = {
      allowNull,
      ...(unique && { unique }),
      ...(defaultValue !== undefined && { defaultValue }),
      ...(validation && { validation }),
    };

    // Explicit relation types
    if (prop['x-belongs-to']) {
      return {
        name,
        type: 'belongsTo',
        interface: 'obo',
        target: prop['x-belongs-to'] as string,
        ...(prop['x-target-collection'] && { targetCollection: prop['x-target-collection'] as string }),
        ...(prop['x-foreign-key'] && { foreignKey: prop['x-foreign-key'] as string }),
        ...baseProps,
        uiSchema: { title, 'x-component': 'AssociationField' },
      };
    }
    if (prop['x-has-one']) {
      return {
        name,
        type: 'hasOne',
        interface: 'o2o',
        target: prop['x-has-one'] as string,
        ...(prop['x-target-collection'] && { targetCollection: prop['x-target-collection'] as string }),
        ...(prop['x-foreign-key'] && { foreignKey: prop['x-foreign-key'] as string }),
        ...baseProps,
        uiSchema: { title, 'x-component': 'AssociationField' },
      };
    }
    if (prop['x-has-many']) {
      return {
        name,
        type: 'hasMany',
        interface: 'o2m',
        target: prop['x-has-many'] as string,
        ...(prop['x-target-collection'] && { targetCollection: prop['x-target-collection'] as string }),
        ...(prop['x-foreign-key'] && { foreignKey: prop['x-foreign-key'] as string }),
        ...baseProps,
        uiSchema: { title, 'x-component': 'AssociationField' },
      };
    }
    if (prop['x-belongs-to-many']) {
      return {
        name,
        type: 'belongsToMany',
        interface: 'm2m',
        target: prop['x-belongs-to-many'] as string,
        ...(prop['x-target-collection'] && { targetCollection: prop['x-target-collection'] as string }),
        ...(prop['x-foreign-key'] && { foreignKey: prop['x-foreign-key'] as string }),
        ...(prop['x-other-key'] && { otherKey: prop['x-other-key'] as string }),
        ...(prop['x-through'] && { through: prop['x-through'] as string }),
        ...baseProps,
        uiSchema: { title, 'x-component': 'AssociationField' },
      };
    }

    // NocoBase-specific types via x-nocobase-type
    const xType = prop['x-nocobase-type'];
    if (xType === 'uid') {
      return { name, type: 'uid', ...baseProps, uiSchema: { title } };
    }
    if (xType === 'jsonb') {
      return { name, type: 'jsonb', ...baseProps, uiSchema: { title } };
    }
    if (xType === 'formula') {
      return {
        name,
        type: 'formula',
        ...baseProps,
        ...(prop['x-expression'] ? { expression: prop['x-expression'] as string } : {}),
        uiSchema: { title },
      };
    }
    if (xType === 'sort') {
      return { name, type: 'sort', ...baseProps, uiSchema: { title } };
    }
    if (xType === 'virtual') {
      return { name, type: 'virtual', ...baseProps, uiSchema: { title } };
    }
    if (xType === 'richText') {
      return { name, type: 'text', interface: 'richText', ...baseProps, uiSchema: { title } };
    }
    if (xType === 'markdown') {
      return { name, type: 'text', interface: 'markdown', ...baseProps, uiSchema: { title } };
    }
    if (xType === 'percent') {
      return { name, type: 'double', interface: 'percent', ...baseProps, uiSchema: { title } };
    }
    if (xType === 'color') {
      return { name, type: 'string', interface: 'color', ...baseProps, uiSchema: { title } };
    }
    if (xType === 'icon') {
      return { name, type: 'string', interface: 'icon', ...baseProps, uiSchema: { title } };
    }
    // Note: 'radio' in NocoBase is a BOOLEAN field (single true per table), not a choice field
    // For radio button UI with options, use enum with radioGroup interface
    if (xType === 'radio') {
      return { name, type: 'boolean', ...baseProps, uiSchema: { title } };
    }

    // Format-based dispatch for string
    if (prop.type === 'string') {
      if (prop.format === 'text') {
        return { name, type: 'text', ...baseProps, uiSchema: { title } };
      }
      if (prop.format === 'password') {
        return { name, type: 'password', ...baseProps, uiSchema: { title } };
      }
      if (prop.format === 'date') {
        return { name, type: 'date', ...baseProps, uiSchema: { title } };
      }
      if (prop.format === 'date-time') {
        return { name, type: 'date', interface: 'datetime', ...baseProps, uiSchema: { title } };
      }
      if (prop.format === 'time') {
        return { name, type: 'time', ...baseProps, uiSchema: { title } };
      }
      if (prop.format === 'uuid') {
        return { name, type: 'uuid', ...baseProps, uiSchema: { title } };
      }
      if (prop.format === 'email') {
        return { name, type: 'string', interface: 'email', ...baseProps, uiSchema: { title } };
      }
      if (prop.format === 'uri') {
        return { name, type: 'string', interface: 'url', ...baseProps, uiSchema: { title } };
      }
      if (prop.format === 'phone') {
        return { name, type: 'string', interface: 'phone', ...baseProps, uiSchema: { title } };
      }
      if (prop.enum) {
        // Check if radioGroup interface is requested
        const useRadioGroup = prop['x-component'] === 'Radio.Group';
        return {
          name,
          type: 'string',
          interface: useRadioGroup ? 'radioGroup' : 'select',
          ...baseProps,
          uiSchema: {
            type: 'string',
            title,
            'x-component': useRadioGroup ? 'Radio.Group' : 'Select',
            enum: (prop.enum as string[]).map((v) => ({ label: v, value: v })),
          },
        };
      }
      return { name, type: 'string', ...baseProps, uiSchema: { title } };
    }

    // Format-based dispatch for integer
    if (prop.type === 'integer') {
      if (prop.format === 'int64') {
        return { name, type: 'bigInt', ...baseProps, uiSchema: { title } };
      }
      return { name, type: 'integer', ...baseProps, uiSchema: { title } };
    }

    // Format-based dispatch for number
    if (prop.type === 'number') {
      if (prop.format === 'float') {
        return { name, type: 'float', ...baseProps, uiSchema: { title } };
      }
      if (prop.format === 'decimal') {
        return {
          name,
          type: 'decimal',
          precision: prop['x-precision'] || 10,
          scale: prop['x-scale'] || 2,
          ...baseProps,
          uiSchema: { title },
        };
      }
      return { name, type: 'double', ...baseProps, uiSchema: { title } };
    }

    // Array with enum items = multipleSelect
    if (prop.type === 'array' && prop.items?.enum) {
      return {
        name,
        type: 'array',
        interface: 'multipleSelect',
        ...baseProps,
        defaultValue: defaultValue ?? [],
        uiSchema: {
          title,
          'x-component': 'Select',
          'x-component-props': { mode: 'multiple' },
          enum: (prop.items.enum as string[]).map((v) => ({ label: v, value: v })),
        },
      };
    }

    // Other types
    const typeMap: Record<string, string> = { boolean: 'boolean', array: 'json', object: 'json' };
    return { name, type: typeMap[prop.type] ?? 'string', ...baseProps, uiSchema: { title } };
  });

  return {
    schema: {
      title: schemaName,
      fields,
      ...(inherits && { inherits }),
      ...(titleField && { titleField }),
    },
    errors,
    rawProperties: props,
  };
}

/**
 * Topologically sort schemas so parents come before children
 */
export function topoSortSchemas(schemas: CollectionSchema[]): CollectionSchema[] {
  const byTitle = new Map(schemas.map((s) => [s.title, s]));
  const sorted: CollectionSchema[] = [];
  const visited = new Set<string>();

  function visit(s: CollectionSchema) {
    if (visited.has(s.title)) return;
    visited.add(s.title);
    for (const parent of s.inherits ?? []) {
      const p = byTitle.get(parent);
      if (p) visit(p);
    }
    sorted.push(s);
  }

  for (const s of schemas) visit(s);
  return sorted;
}
