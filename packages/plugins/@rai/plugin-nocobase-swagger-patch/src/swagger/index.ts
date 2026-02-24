/**
 * OpenAPI documentation for NocoBase collection and field endpoints
 *
 * This plugin provides enhanced OpenAPI/Swagger documentation for NocoBase's
 * collection management APIs. NocoBase's SwaggerManager automatically merges
 * this with existing definitions.
 */

import schemas from './schemas';
import parameters from './parameters';
import collectionPaths from './paths/collections';
import fieldPaths from './paths/fields';

export default {
  info: {
    title: 'NocoBase Collections API',
    description: 'API documentation for NocoBase collection and field management',
    version: '1.0.0',
  },
  tags: [
    {
      name: 'collections',
      description: 'Collection management endpoints',
    },
    {
      name: 'fields',
      description: 'Field management endpoints (top-level)',
    },
    {
      name: 'collections.fields',
      description: 'Field management endpoints (nested under collections)',
    },
  ],
  paths: {
    ...collectionPaths,
    ...fieldPaths,
  },
  components: {
    schemas: {
      CollectionModel: schemas.CollectionModel,
      CollectionModelWithFields: schemas.CollectionModelWithFields,
      FieldModel: schemas.FieldModel,
      FieldCreateInput: schemas.FieldCreateInput,
      CollectionCreateInput: schemas.CollectionCreateInput,
      PaginatedResponse: schemas.PaginatedResponse,
      ErrorResponse: schemas.ErrorResponse,
      MoveRequestBody: schemas.MoveRequestBody,
    },
    parameters: {
      collectionNamePath: parameters.collectionNamePath,
      filterByTk: parameters.filterByTk,
      filterByTks: parameters.filterByTks,
      paginate: parameters.paginate,
      page: parameters.page,
      pageSize: parameters.pageSize,
      filter: parameters.filter,
      fields: parameters.fields,
      appends: parameters.appends,
      except: parameters.except,
      sort: parameters.sort,
      whitelist: parameters.whitelist,
      blacklist: parameters.blacklist,
      updateAssociationValues: parameters.updateAssociationValues,
      cascade: parameters.cascade,
    },
  },
};
