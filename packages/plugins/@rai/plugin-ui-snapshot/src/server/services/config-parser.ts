/**
 * JSON Parser Service
 *
 * Parses and validates JSON configuration files for UI snapshots.
 */
import type {
  PageConfig,
  PageSettings,
  LayoutConfig,
  BlockConfig,
  TableBlockConfig,
  ChartBlockConfig,
  DetailsBlockConfig,
  FormBlockConfig,
  ValidatedPageConfig,
} from '../types';

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  config?: ValidatedPageConfig;
}

/**
 * Parse JSON string into PageConfig
 */
export function parseConfig(jsonContent: string): PageConfig {
  const parsed = JSON.parse(jsonContent) as PageConfig;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid JSON: expected an object');
  }
  return parsed;
}

/**
 * Validate PageConfig structure
 */
export function validatePageConfig(config: PageConfig): ValidationResult {
  const errors: string[] = [];

  // Validate page settings
  if (!config.page) {
    errors.push('Missing required field: page');
  } else {
    if (!config.page.title) {
      errors.push('Missing required field: page.title');
    }
  }

  // Validate layout
  if (!config.layout) {
    errors.push('Missing required field: layout');
  } else if (!config.layout.rows || !Array.isArray(config.layout.rows)) {
    errors.push('layout.rows must be an array');
  } else {
    validateLayout(config.layout, config.blocks || {}, errors);
  }

  // Validate blocks
  if (!config.blocks || typeof config.blocks !== 'object') {
    errors.push('Missing required field: blocks (must be an object)');
  } else {
    validateBlocks(config.blocks, config.collections || {}, errors);
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Create validated config with resolved collections
  const resolvedCollections: Record<string, string> = {};
  const collections = config.collections || {};

  // Build resolved collection mapping
  for (const [alias, internalName] of Object.entries(collections)) {
    resolvedCollections[alias] = internalName;
  }

  // For blocks that reference collections, verify they can be resolved
  for (const [blockName, blockConfig] of Object.entries(config.blocks)) {
    if ('collection' in blockConfig && blockConfig.collection) {
      const collectionName = blockConfig.collection;
      // If it's an alias, resolve it; otherwise use as-is
      if (collections[collectionName]) {
        resolvedCollections[collectionName] = collections[collectionName];
      } else if (!collectionName.startsWith('t_')) {
        errors.push(
          `Block '${blockName}': collection '${collectionName}' not found in collections mapping and doesn't look like an internal name (expected t_xxx format)`
        );
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const validatedConfig: ValidatedPageConfig = {
    ...config,
    _resolvedCollections: resolvedCollections,
  };

  return { valid: true, errors: [], config: validatedConfig };
}

/**
 * Validate layout structure
 */
function validateLayout(layout: LayoutConfig, blocks: Record<string, BlockConfig>, errors: string[]): void {
  for (let rowIdx = 0; rowIdx < layout.rows.length; rowIdx++) {
    const row = layout.rows[rowIdx];

    if (!row.columns || !Array.isArray(row.columns)) {
      errors.push(`layout.rows[${rowIdx}].columns must be an array`);
      continue;
    }

    let totalWidth = 0;
    for (let colIdx = 0; colIdx < row.columns.length; colIdx++) {
      const col = row.columns[colIdx];

      if (typeof col.width !== 'number' || col.width < 1 || col.width > 24) {
        errors.push(`layout.rows[${rowIdx}].columns[${colIdx}].width must be a number between 1 and 24`);
      } else {
        totalWidth += col.width;
      }

      if (!col.blocks || !Array.isArray(col.blocks)) {
        errors.push(`layout.rows[${rowIdx}].columns[${colIdx}].blocks must be an array`);
        continue;
      }

      for (const blockRef of col.blocks) {
        if (!blockRef.$ref) {
          errors.push(`Block reference in layout.rows[${rowIdx}].columns[${colIdx}] must have $ref`);
          continue;
        }

        // Extract block name from $ref (e.g., "#/blocks/workstation_table" -> "workstation_table")
        const match = blockRef.$ref.match(/^#\/blocks\/(.+)$/);
        if (!match) {
          errors.push(`Invalid block reference format: ${blockRef.$ref} (expected #/blocks/<name>)`);
          continue;
        }

        const blockName = match[1];
        if (!blocks[blockName]) {
          errors.push(`Block reference '${blockRef.$ref}' refers to undefined block '${blockName}'`);
        }
      }
    }

    if (totalWidth > 24) {
      errors.push(`layout.rows[${rowIdx}] total column width (${totalWidth}) exceeds 24`);
    }
  }
}

/**
 * Validate blocks configuration
 */
function validateBlocks(blocks: Record<string, BlockConfig>, collections: Record<string, string>, errors: string[]): void {
  for (const [blockName, blockConfig] of Object.entries(blocks)) {
    if (!blockConfig.type) {
      errors.push(`Block '${blockName}': missing required field 'type'`);
      continue;
    }

    switch (blockConfig.type) {
      case 'TableBlockModel':
        validateTableBlock(blockName, blockConfig as TableBlockConfig, errors);
        break;
      case 'ChartBlockModel':
        validateChartBlock(blockName, blockConfig as ChartBlockConfig, errors);
        break;
      case 'DetailsBlockModel':
        validateDetailsBlock(blockName, blockConfig as DetailsBlockConfig, errors);
        break;
      case 'FormBlockModel':
        validateFormBlock(blockName, blockConfig as FormBlockConfig, errors);
        break;
      case 'MarkdownBlockModel':
        // Markdown doesn't need collection
        break;
      default:
        errors.push(`Block '${blockName}': unknown block type '${blockConfig.type}'`);
    }
  }
}

/**
 * Validate table block configuration
 */
function validateTableBlock(name: string, config: TableBlockConfig, errors: string[]): void {
  if (!config.collection) {
    errors.push(`Block '${name}': TableBlockModel requires 'collection'`);
  }

  if (!config.columns || !Array.isArray(config.columns) || config.columns.length === 0) {
    errors.push(`Block '${name}': TableBlockModel requires 'columns' array with at least one column`);
  } else {
    for (let i = 0; i < config.columns.length; i++) {
      const col = config.columns[i];
      if (!col.field) {
        errors.push(`Block '${name}': columns[${i}] requires 'field'`);
      }
    }
  }

  if (config.actions) {
    const validActions = ['filter', 'view', 'edit', 'delete', 'create', 'refresh', 'export'];
    for (const action of config.actions) {
      if (!validActions.includes(action.type)) {
        errors.push(`Block '${name}': invalid action type '${action.type}'`);
      }
    }
  }
}

/**
 * Validate chart block configuration
 */
function validateChartBlock(name: string, config: ChartBlockConfig, errors: string[]): void {
  if (!config.collection) {
    errors.push(`Block '${name}': ChartBlockModel requires 'collection'`);
  }

  if (!config.chart) {
    errors.push(`Block '${name}': ChartBlockModel requires 'chart'`);
    return;
  }

  const validChartTypes = ['pie', 'bar', 'line', 'area', 'scatter', 'dualAxes'];
  if (!validChartTypes.includes(config.chart.type)) {
    errors.push(`Block '${name}': invalid chart type '${config.chart.type}'`);
  }

  if (!config.chart.dimension) {
    errors.push(`Block '${name}': chart requires 'dimension'`);
  }

  if (!config.chart.measure) {
    errors.push(`Block '${name}': chart requires 'measure'`);
  } else {
    const validAggregations = ['count', 'sum', 'avg', 'min', 'max'];
    if (!validAggregations.includes(config.chart.measure.aggregation)) {
      errors.push(`Block '${name}': invalid aggregation '${config.chart.measure.aggregation}'`);
    }
    if (!config.chart.measure.field) {
      errors.push(`Block '${name}': measure requires 'field'`);
    }
  }
}

/**
 * Validate details block configuration
 */
function validateDetailsBlock(name: string, config: DetailsBlockConfig, errors: string[]): void {
  if (!config.collection) {
    errors.push(`Block '${name}': DetailsBlockModel requires 'collection'`);
  }

  if (!config.fields || !Array.isArray(config.fields) || config.fields.length === 0) {
    errors.push(`Block '${name}': DetailsBlockModel requires 'fields' array with at least one field`);
  } else {
    for (let i = 0; i < config.fields.length; i++) {
      const field = config.fields[i];
      if (!field.field) {
        errors.push(`Block '${name}': fields[${i}] requires 'field'`);
      }
    }
  }
}

/**
 * Validate form block configuration
 */
function validateFormBlock(name: string, config: FormBlockConfig, errors: string[]): void {
  if (!config.collection) {
    errors.push(`Block '${name}': FormBlockModel requires 'collection'`);
  }

  if (!config.fields || !Array.isArray(config.fields) || config.fields.length === 0) {
    errors.push(`Block '${name}': FormBlockModel requires 'fields' array with at least one field`);
  } else {
    for (let i = 0; i < config.fields.length; i++) {
      const field = config.fields[i];
      if (!field.field) {
        errors.push(`Block '${name}': fields[${i}] requires 'field'`);
      }
    }
  }
}

/**
 * Resolve collection alias to internal name
 */
export function resolveCollection(alias: string, collections: Record<string, string>): string {
  // If it's already an internal name (starts with t_), return as-is
  if (alias.startsWith('t_')) {
    return alias;
  }
  // Otherwise look up in mapping
  const resolved = collections[alias];
  if (!resolved) {
    throw new Error(`Unknown collection alias: ${alias}`);
  }
  return resolved;
}

/**
 * Extract block name from $ref
 */
export function extractBlockName(ref: string): string {
  const match = ref.match(/^#\/blocks\/(.+)$/);
  if (!match) {
    throw new Error(`Invalid block reference: ${ref}`);
  }
  return match[1];
}
