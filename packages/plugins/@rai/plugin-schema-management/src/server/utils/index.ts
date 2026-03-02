export { mapFieldToOpenAPI, normalizeFieldName, type FieldMapperContext } from './field-mapper';
export {
  parseOpenAPISpec,
  topoSortSchemas,
  PRESET_FIELDS,
  type CollectionSchema,
  type FieldSchema,
  type SelectOption,
  type ParsedSpec,
} from './spec-parser';
export {
  classifyChanges,
  canAutoApply,
  type ClassifiedChange,
  type ClassifiedChanges,
  type OpenAPIDiffResult,
} from './diff-classifier';
export {
  validateMigration,
  validateRemoveEnumValues,
  type ValidationWarning,
  type ValidationResult,
} from './data-validator';
