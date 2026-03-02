import type { Context } from '@nocobase/actions';

/**
 * Classification of a schema change
 */
export interface ClassifiedChange {
  type: 'add_field' | 'remove_field' | 'modify_field' | 'change_type' | 'change_relation' |
        'make_required' | 'make_optional' | 'add_enum' | 'remove_enum' |
        'change_validation' | 'add_unique' | 'remove_unique' | 'change_metadata';
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
 * Raw diff from openapi-diff library
 */
export interface OpenAPIDiffResult {
  breakingDifferences: DiffEntry[];
  nonBreakingDifferences: DiffEntry[];
  unclassifiedDifferences: DiffEntry[];
}

interface DiffEntry {
  code: string;
  type?: string;
  action?: string;
  sourceSpecEntityDetails?: EntityDetails[];
  destinationSpecEntityDetails?: EntityDetails[];
  entity?: string;
  source?: string;
  details?: any;
}

interface EntityDetails {
  location: string;
  value?: any;
}

/**
 * Extract field name from a JSON pointer path like
 * "/components/schemas/MyCollection/properties/fieldName"
 */
function extractFieldName(location: string): string | null {
  const match = location.match(/\/properties\/([^/]+)/);
  return match ? match[1] : null;
}

/**
 * Check if a diff entry relates to x-* extension properties
 */
function isExtensionChange(entry: DiffEntry): boolean {
  const location = entry.sourceSpecEntityDetails?.[0]?.location ||
                   entry.destinationSpecEntityDetails?.[0]?.location || '';
  return location.includes('/x-') || entry.entity?.startsWith('x-') || false;
}

/**
 * Classify openapi-diff results into NocoBase-specific categories
 *
 * The openapi-diff library provides:
 * - breakingDifferences: Changes that break backwards compatibility (removed paths, added required props)
 * - nonBreakingDifferences: Safe changes (added optional props)
 * - unclassifiedDifferences: Changes it doesn't know how to classify (x-* extensions)
 *
 * We reclassify based on NocoBase semantics:
 * - x-unique changes, x-belongs-to, x-inherits, etc.
 */
export function classifyChanges(diffResult: OpenAPIDiffResult, ctx?: Context): ClassifiedChanges {
  const result: ClassifiedChanges = {
    nonBreaking: [],
    breaking: [],
    unclassified: [],
  };

  // Process openapi-diff's breaking differences
  for (const diff of diffResult.breakingDifferences || []) {
    const classified = classifySingleDiff(diff, 'breaking');
    if (classified) {
      result[classified.category].push(classified.change);
    }
  }

  // Process openapi-diff's non-breaking differences
  for (const diff of diffResult.nonBreakingDifferences || []) {
    const classified = classifySingleDiff(diff, 'non-breaking');
    if (classified) {
      result[classified.category].push(classified.change);
    }
  }

  // Process openapi-diff's unclassified differences (mostly x-* extensions)
  for (const diff of diffResult.unclassifiedDifferences || []) {
    const classified = classifyExtensionDiff(diff);
    if (classified) {
      result[classified.category].push(classified.change);
    }
  }

  return result;
}

/**
 * Classify a single diff entry from openapi-diff
 */
function classifySingleDiff(
  diff: DiffEntry,
  originalCategory: 'breaking' | 'non-breaking'
): { category: 'nonBreaking' | 'breaking' | 'unclassified'; change: ClassifiedChange } | null {
  const location = diff.sourceSpecEntityDetails?.[0]?.location ||
                   diff.destinationSpecEntityDetails?.[0]?.location || '';
  const field = extractFieldName(location);

  // Handle property added
  if (diff.code === 'request.body.scope.add' ||
      diff.code === 'response.body.scope.add' ||
      diff.action === 'add') {
    if (field) {
      return {
        category: 'nonBreaking',
        change: {
          type: 'add_field',
          field,
          description: `Add new field "${field}"`,
          details: { value: diff.destinationSpecEntityDetails?.[0]?.value },
        },
      };
    }
  }

  // Handle property removed
  if (diff.code === 'request.body.scope.remove' ||
      diff.code === 'response.body.scope.remove' ||
      diff.action === 'remove') {
    if (field) {
      return {
        category: 'breaking',
        change: {
          type: 'remove_field',
          field,
          description: `Remove field "${field}"`,
          details: { value: diff.sourceSpecEntityDetails?.[0]?.value },
        },
      };
    }
  }

  // Handle required array changes
  if (diff.code?.includes('required') || location.includes('/required')) {
    if (diff.action === 'add' || diff.code?.includes('.add')) {
      // Added to required array = making field required (BREAKING if NULLs exist)
      const requiredField = diff.destinationSpecEntityDetails?.[0]?.value || field;
      return {
        category: 'breaking',
        change: {
          type: 'make_required',
          field: requiredField,
          description: `Make field "${requiredField}" required`,
        },
      };
    } else if (diff.action === 'remove' || diff.code?.includes('.remove')) {
      // Removed from required array = making field optional (non-breaking)
      const optionalField = diff.sourceSpecEntityDetails?.[0]?.value || field;
      return {
        category: 'nonBreaking',
        change: {
          type: 'make_optional',
          field: optionalField,
          description: `Make field "${optionalField}" optional`,
        },
      };
    }
  }

  // Handle type changes
  if (diff.code?.includes('type') && diff.action === 'change') {
    const oldValue = diff.sourceSpecEntityDetails?.[0]?.value;
    const newValue = diff.destinationSpecEntityDetails?.[0]?.value;
    return {
      category: 'breaking',
      change: {
        type: 'change_type',
        field: field || 'unknown',
        description: `Change type from "${oldValue}" to "${newValue}"`,
        details: { oldValue, newValue },
      },
    };
  }

  // Handle enum changes
  if (diff.code?.includes('enum') || location.includes('/enum')) {
    if (diff.action === 'add' || diff.code?.includes('.add')) {
      const addedValue = diff.destinationSpecEntityDetails?.[0]?.value;
      return {
        category: 'nonBreaking',
        change: {
          type: 'add_enum',
          field: field || 'unknown',
          description: `Add enum option "${addedValue}"`,
          details: { addedValue },
        },
      };
    } else if (diff.action === 'remove' || diff.code?.includes('.remove')) {
      const removedValue = diff.sourceSpecEntityDetails?.[0]?.value;
      return {
        category: 'breaking',
        change: {
          type: 'remove_enum',
          field: field || 'unknown',
          description: `Remove enum option "${removedValue}"`,
          details: { removedValue },
        },
      };
    }
  }

  // Handle validation constraint changes (minLength, maxLength, pattern, etc.)
  // These are non-breaking since NocoBase uses JOI validation, not Postgres constraints
  if (diff.code?.includes('minLength') || diff.code?.includes('maxLength') ||
      diff.code?.includes('pattern') || diff.code?.includes('minimum') ||
      diff.code?.includes('maximum') || diff.code?.includes('minItems') ||
      diff.code?.includes('maxItems')) {
    const oldValue = diff.sourceSpecEntityDetails?.[0]?.value;
    const newValue = diff.destinationSpecEntityDetails?.[0]?.value;
    return {
      category: 'nonBreaking',
      change: {
        type: 'change_validation',
        field: field || 'unknown',
        description: `Change validation constraint`,
        details: { oldValue, newValue },
      },
    };
  }

  // If we couldn't classify it specifically, preserve original category
  if (field) {
    return {
      category: originalCategory === 'breaking' ? 'breaking' : 'nonBreaking',
      change: {
        type: 'modify_field',
        field,
        description: diff.code || 'Unknown modification',
        details: { code: diff.code, action: diff.action },
      },
    };
  }

  return null;
}

/**
 * Classify x-* extension changes that openapi-diff marks as unclassified
 */
function classifyExtensionDiff(
  diff: DiffEntry
): { category: 'nonBreaking' | 'breaking' | 'unclassified'; change: ClassifiedChange } | null {
  const location = diff.sourceSpecEntityDetails?.[0]?.location ||
                   diff.destinationSpecEntityDetails?.[0]?.location || '';
  const field = extractFieldName(location);

  // x-unique changes
  if (location.includes('/x-unique')) {
    const oldValue = diff.sourceSpecEntityDetails?.[0]?.value;
    const newValue = diff.destinationSpecEntityDetails?.[0]?.value;

    if (oldValue === false && newValue === true) {
      // Adding unique constraint = BREAKING (need to check for duplicates)
      return {
        category: 'breaking',
        change: {
          type: 'add_unique',
          field: field || 'unknown',
          description: `Add unique constraint to "${field}"`,
        },
      };
    } else if (oldValue === true && newValue === false) {
      // Removing unique constraint = non-breaking
      return {
        category: 'nonBreaking',
        change: {
          type: 'remove_unique',
          field: field || 'unknown',
          description: `Remove unique constraint from "${field}"`,
        },
      };
    }
  }

  // x-belongs-to, x-has-one, x-has-many, x-belongs-to-many changes
  if (location.includes('/x-belongs-to') || location.includes('/x-has-one') ||
      location.includes('/x-has-many') || location.includes('/x-belongs-to-many')) {
    const oldValue = diff.sourceSpecEntityDetails?.[0]?.value;
    const newValue = diff.destinationSpecEntityDetails?.[0]?.value;
    return {
      category: 'breaking',
      change: {
        type: 'change_relation',
        field: field || 'unknown',
        description: `Change relation target from "${oldValue}" to "${newValue}"`,
        details: { oldValue, newValue },
      },
    };
  }

  // x-inherits changes
  if (location.includes('/x-inherits')) {
    return {
      category: 'breaking',
      change: {
        type: 'change_relation',
        field: 'inheritance',
        description: 'Change collection inheritance',
        details: {
          oldValue: diff.sourceSpecEntityDetails?.[0]?.value,
          newValue: diff.destinationSpecEntityDetails?.[0]?.value,
        },
      },
    };
  }

  // x-nocobase-type changes
  if (location.includes('/x-nocobase-type')) {
    const oldValue = diff.sourceSpecEntityDetails?.[0]?.value;
    const newValue = diff.destinationSpecEntityDetails?.[0]?.value;
    return {
      category: 'breaking',
      change: {
        type: 'change_type',
        field: field || 'unknown',
        description: `Change NocoBase type from "${oldValue}" to "${newValue}"`,
        details: { oldValue, newValue },
      },
    };
  }

  // x-title-field changes (metadata only, non-breaking)
  if (location.includes('/x-title-field')) {
    return {
      category: 'nonBreaking',
      change: {
        type: 'change_metadata',
        field: 'titleField',
        description: 'Change title field',
        details: {
          oldValue: diff.sourceSpecEntityDetails?.[0]?.value,
          newValue: diff.destinationSpecEntityDetails?.[0]?.value,
        },
      },
    };
  }

  // x-expression changes (formula fields)
  if (location.includes('/x-expression')) {
    return {
      category: 'nonBreaking',
      change: {
        type: 'change_validation',
        field: field || 'unknown',
        description: 'Change formula expression',
        details: {
          oldValue: diff.sourceSpecEntityDetails?.[0]?.value,
          newValue: diff.destinationSpecEntityDetails?.[0]?.value,
        },
      },
    };
  }

  // Default: mark as unclassified
  if (field) {
    return {
      category: 'unclassified',
      change: {
        type: 'modify_field',
        field,
        description: `Unknown extension change: ${location}`,
        details: { location },
      },
    };
  }

  return null;
}

/**
 * Determine if a set of changes can be auto-applied (no breaking changes)
 */
export function canAutoApply(changes: ClassifiedChanges): boolean {
  return changes.breaking.length === 0;
}
