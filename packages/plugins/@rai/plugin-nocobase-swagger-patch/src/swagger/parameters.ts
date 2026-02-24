/**
 * OpenAPI reusable parameter definitions for NocoBase collections and fields
 */

export const collectionNamePath = {
  name: 'collectionName',
  in: 'path',
  required: true,
  description: 'Collection name',
  schema: {
    type: 'string',
  },
};

export const filterByTk = {
  name: 'filterByTk',
  in: 'query',
  description: 'Filter by target key (default by primary key)',
  schema: {
    type: 'string',
  },
};

export const filterByTks = {
  name: 'filterByTk',
  in: 'query',
  description: 'Filter by target keys (comma-separated), e.g., "1,2,3"',
  schema: {
    type: 'array',
    items: { type: 'string' },
  },
};

export const paginate = {
  name: 'paginate',
  in: 'query',
  description: 'Enable/disable pagination (default: true). Set to "false" to return all records.',
  schema: {
    oneOf: [{ type: 'boolean' }, { type: 'string', enum: ['false'] }],
  },
};

export const page = {
  name: 'page',
  in: 'query',
  description: 'Page number (default: 1)',
  schema: {
    type: 'integer',
    default: 1,
    minimum: 1,
  },
};

export const pageSize = {
  name: 'pageSize',
  in: 'query',
  description: 'Items per page (default: 20)',
  schema: {
    type: 'integer',
    default: 20,
    minimum: 1,
  },
};

export const filter = {
  name: 'filter',
  in: 'query',
  description: 'Filter using NocoBase operators ($gt, $like, $in, etc.)',
  content: {
    'application/json': {
      schema: {
        type: 'object',
      },
    },
  },
};

export const fields = {
  name: 'fields',
  in: 'query',
  description: 'Fields to return, e.g., "field1,field2" or ["field1","field2"]',
  schema: {
    oneOf: [
      { type: 'array', items: { type: 'string' } },
      { type: 'string' },
    ],
  },
};

export const appends = {
  name: 'appends',
  in: 'query',
  description: 'Associated fields to include, e.g., "assoc1,assoc2"',
  schema: {
    oneOf: [
      { type: 'array', items: { type: 'string' } },
      { type: 'string' },
    ],
  },
};

export const except = {
  name: 'except',
  in: 'query',
  description: 'Fields to exclude from results',
  schema: {
    oneOf: [
      { type: 'array', items: { type: 'string' } },
      { type: 'string' },
    ],
  },
};

export const sort = {
  name: 'sort',
  in: 'query',
  description: 'Sort order, e.g., "-createdAt,name" or ["-createdAt","name"]. Prefix with "-" for descending.',
  schema: {
    oneOf: [
      { type: 'array', items: { type: 'string' }, example: ['-id', 'createdAt'] },
      { type: 'string', example: '-id,createdAt' },
    ],
  },
};

export const whitelist = {
  name: 'whitelist',
  in: 'query',
  description: 'Allowed fields to set (mutation operations)',
  schema: {
    oneOf: [
      { type: 'array', items: { type: 'string' } },
      { type: 'string' },
    ],
  },
};

export const blacklist = {
  name: 'blacklist',
  in: 'query',
  description: 'Forbidden fields (mutation operations)',
  schema: {
    oneOf: [
      { type: 'array', items: { type: 'string' } },
      { type: 'string' },
    ],
  },
};

export const updateAssociationValues = {
  name: 'updateAssociationValues',
  in: 'query',
  description: 'Association fields to update',
  schema: {
    oneOf: [
      { type: 'array', items: { type: 'string' } },
      { type: 'string' },
    ],
  },
};

export const cascade = {
  name: 'cascade',
  in: 'query',
  description: 'Whether to cascade delete associated records',
  schema: {
    type: 'boolean',
  },
};

// Common parameter sets for convenience
export const listQueryParams = [paginate, page, pageSize, filter, fields, appends, except, sort];
export const getQueryParams = [filterByTk, filter, fields, appends, except];
export const mutationQueryParams = [whitelist, blacklist, updateAssociationValues];

export default {
  collectionNamePath,
  filterByTk,
  filterByTks,
  paginate,
  page,
  pageSize,
  filter,
  fields,
  appends,
  except,
  sort,
  whitelist,
  blacklist,
  updateAssociationValues,
  cascade,
};
