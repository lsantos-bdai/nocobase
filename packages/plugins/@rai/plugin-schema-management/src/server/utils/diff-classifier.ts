// System fields that should be ignored in diff comparisons
const SYSTEM_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'createdBy',
  'updatedBy',
  'createdById',
  'updatedById',
  'id',
]);

/**
 * Classification of a schema change
 */
export interface ClassifiedChange {
  type: 'add_field' | 'remove_field' | 'modify_field' | 'change_type' | 'change_relation' |
        'make_required' | 'make_optional' | 'add_enum' | 'remove_enum' |
        'change_validation' | 'add_unique' | 'remove_unique' | 'change_metadata' |
        'change_collection_title';
  field: string;
  description: string;
  details?: Record<string, unknown>;
}

/**
 * Result of classifying all changes
 */
export interface ClassifiedChanges {
  nonBreaking: ClassifiedChange[];
  breaking: ClassifiedChange[];
  unclassified: ClassifiedChange[];
}

/**
 * Determine if a set of changes can be auto-applied (no breaking changes)
 */
export function canAutoApply(changes: ClassifiedChanges): boolean {
  return changes.breaking.length === 0;
}

/**
 * Custom schema diff that directly compares OpenAPI components/schemas.
 */
export function diffSchemas(currentSpec: any, newSpec: any): ClassifiedChanges {
  const changes: ClassifiedChanges = { nonBreaking: [], breaking: [], unclassified: [] };

  const currentSchemas = currentSpec?.components?.schemas || {};
  const newSchemas = newSpec?.components?.schemas || {};

  // Get the first (and typically only) schema from each spec
  const currentSchemaName = Object.keys(currentSchemas)[0];
  const newSchemaName = Object.keys(newSchemas)[0];

  if (!currentSchemaName || !newSchemaName) {
    return changes;
  }

  // Detect collection title rename
  if (currentSchemaName !== newSchemaName) {
    changes.nonBreaking.push({
      type: 'change_collection_title',
      field: 'title',
      description: `Rename collection from "${currentSchemaName}" to "${newSchemaName}"`,
      details: { oldValue: currentSchemaName, newValue: newSchemaName },
    });
  }

  const currentSchema = currentSchemas[currentSchemaName];
  const newSchema = newSchemas[newSchemaName];

  const currentProps = currentSchema?.properties || {};
  const newProps = newSchema?.properties || {};
  const currentRequired = new Set<string>(currentSchema?.required || []);
  const newRequired = new Set<string>(newSchema?.required || []);

  // Detect property additions
  for (const field of Object.keys(newProps)) {
    if (!(field in currentProps)) {
      changes.nonBreaking.push({
        type: 'add_field',
        field,
        description: `Add new field "${field}"`,
        details: { value: newProps[field] },
      });
    }
  }

  // Detect property removals
  for (const field of Object.keys(currentProps)) {
    if (!(field in newProps)) {
      changes.breaking.push({
        type: 'remove_field',
        field,
        description: `Remove field "${field}"`,
        details: { value: currentProps[field] },
      });
    }
  }

  // Detect property modifications (type, x-unique, enum, etc.)
  for (const field of Object.keys(newProps)) {
    if (field in currentProps) {
      diffProperty(field, currentProps[field], newProps[field], changes);
    }
  }

  // Detect required array changes (skip system fields)
  for (const field of newRequired) {
    if (!currentRequired.has(field) && !SYSTEM_FIELDS.has(field)) {
      changes.breaking.push({
        type: 'make_required',
        field,
        description: `Make field "${field}" required`,
      });
    }
  }

  for (const field of currentRequired) {
    if (!newRequired.has(field) && !SYSTEM_FIELDS.has(field)) {
      changes.nonBreaking.push({
        type: 'make_optional',
        field,
        description: `Make field "${field}" optional`,
      });
    }
  }

  // Detect schema-level x-* changes
  diffSchemaExtensions(currentSchema, newSchema, changes);

  return changes;
}

/**
 * Compare two property definitions and detect changes
 */
function diffProperty(
  field: string,
  currentProp: any,
  newProp: any,
  changes: ClassifiedChanges
): void {
  // Type changes
  if (currentProp.type !== newProp.type) {
    changes.breaking.push({
      type: 'change_type',
      field,
      description: `Change type from "${currentProp.type}" to "${newProp.type}"`,
      details: { oldValue: currentProp.type, newValue: newProp.type },
    });
  }

  // x-unique changes
  const currentUnique = currentProp['x-unique'];
  const newUnique = newProp['x-unique'];
  if (currentUnique !== newUnique) {
    if (newUnique === true && (currentUnique === undefined || currentUnique === false)) {
      // Adding unique constraint = BREAKING (need to check for duplicates)
      changes.breaking.push({
        type: 'add_unique',
        field,
        description: `Add unique constraint to "${field}"`,
      });
    } else if ((newUnique === undefined || newUnique === false) && currentUnique === true) {
      // Removing unique constraint = non-breaking
      changes.nonBreaking.push({
        type: 'remove_unique',
        field,
        description: `Remove unique constraint from "${field}"`,
      });
    }
  }

  // x-nocobase-type changes
  const currentNcType = currentProp['x-nocobase-type'];
  const newNcType = newProp['x-nocobase-type'];
  if (currentNcType !== newNcType && currentNcType !== undefined && newNcType !== undefined) {
    changes.breaking.push({
      type: 'change_type',
      field,
      description: `Change NocoBase type from "${currentNcType}" to "${newNcType}"`,
      details: { oldValue: currentNcType, newValue: newNcType },
    });
  }

  // Enum changes
  const currentEnum = currentProp.enum;
  const newEnum = newProp.enum;
  if (currentEnum || newEnum) {
    const currentSet = new Set(currentEnum || []);
    const newSet = new Set(newEnum || []);

    // Added enum values (non-breaking)
    for (const val of newSet) {
      if (!currentSet.has(val)) {
        changes.nonBreaking.push({
          type: 'add_enum',
          field,
          description: `Add enum option "${val}"`,
          details: { addedValue: val },
        });
      }
    }

    // Removed enum values (breaking)
    for (const val of currentSet) {
      if (!newSet.has(val)) {
        changes.breaking.push({
          type: 'remove_enum',
          field,
          description: `Remove enum option "${val}"`,
          details: { removedValue: val },
        });
      }
    }
  }

  // Relation target changes (x-belongs-to, x-has-one, x-has-many, x-belongs-to-many)
  for (const relationKey of ['x-belongs-to', 'x-has-one', 'x-has-many', 'x-belongs-to-many']) {
    const currentRelation = currentProp[relationKey];
    const newRelation = newProp[relationKey];
    if (currentRelation !== newRelation && (currentRelation || newRelation)) {
      changes.breaking.push({
        type: 'change_relation',
        field,
        description: `Change relation target from "${currentRelation}" to "${newRelation}"`,
        details: { oldValue: currentRelation, newValue: newRelation },
      });
    }
  }

  // Validation constraint changes (non-breaking since NocoBase uses JOI, not Postgres constraints)
  for (const validationKey of ['minLength', 'maxLength', 'pattern', 'minimum', 'maximum', 'minItems', 'maxItems']) {
    const currentVal = currentProp[validationKey];
    const newVal = newProp[validationKey];
    if (currentVal !== newVal && (currentVal !== undefined || newVal !== undefined)) {
      changes.nonBreaking.push({
        type: 'change_validation',
        field,
        description: `Change ${validationKey} from "${currentVal}" to "${newVal}"`,
        details: { oldValue: currentVal, newValue: newVal },
      });
    }
  }

  // x-expression changes (formula fields)
  const currentExpr = currentProp['x-expression'];
  const newExpr = newProp['x-expression'];
  if (currentExpr !== newExpr && (currentExpr || newExpr)) {
    changes.nonBreaking.push({
      type: 'change_validation',
      field,
      description: 'Change formula expression',
      details: { oldValue: currentExpr, newValue: newExpr },
    });
  }
}

/**
 * Compare schema-level extensions (x-inherits, x-title-field, etc.)
 */
function diffSchemaExtensions(
  currentSchema: any,
  newSchema: any,
  changes: ClassifiedChanges
): void {
  // x-inherits changes
  const currentInherits = currentSchema?.['x-inherits'];
  const newInherits = newSchema?.['x-inherits'];
  if (JSON.stringify(currentInherits) !== JSON.stringify(newInherits)) {
    changes.breaking.push({
      type: 'change_relation',
      field: 'inheritance',
      description: 'Change collection inheritance',
      details: { oldValue: currentInherits, newValue: newInherits },
    });
  }

  // x-title-field changes (metadata only, non-breaking)
  const currentTitleField = currentSchema?.['x-title-field'];
  const newTitleField = newSchema?.['x-title-field'];
  if (currentTitleField !== newTitleField) {
    changes.nonBreaking.push({
      type: 'change_metadata',
      field: 'titleField',
      description: 'Change title field',
      details: { oldValue: currentTitleField, newValue: newTitleField },
    });
  }
}
