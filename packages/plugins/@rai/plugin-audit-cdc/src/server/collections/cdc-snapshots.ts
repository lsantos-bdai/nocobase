import { defineCollection } from '@nocobase/database';

export default defineCollection({
  name: 'cdc_snapshots',
  title: 'CDC Snapshots',
  createdBy: false,
  updatedBy: false,
  updatedAt: false,
  logging: false,
  shared: true,
  dumpRules: {
    group: 'log',
  },
  fields: [
    {
      type: 'bigInt',
      name: 'id',
      primaryKey: true,
      autoIncrement: true,
    },
    {
      type: 'string',
      name: 'collectionName',
      index: true,
    },
    {
      type: 'string',
      name: 'recordId',
      index: true,
    },
    {
      type: 'string',
      name: 'operation',
      // 'create' | 'update' | 'destroy'
    },
    {
      type: 'json',
      name: 'beforeData',
      // Full record BEFORE (null for create)
    },
    {
      type: 'json',
      name: 'afterData',
      // Full record AFTER (null for destroy)
    },
    {
      type: 'jsonb',
      name: 'changedFields',
      // Array of field names that changed
      defaultValue: [],
    },
    {
      type: 'belongsTo',
      name: 'user',
      target: 'users',
      foreignKey: 'userId',
    },
    {
      type: 'boolean',
      name: 'isApiKey',
      defaultValue: false,
    },
    {
      type: 'date',
      name: 'createdAt',
    },
    {
      type: 'integer',
      name: 'version',
      // Auto-incrementing per record
    },
  ],
  indexes: [
    {
      fields: ['collectionName', 'recordId'],
    },
    {
      fields: ['createdAt'],
    },
    {
      fields: ['collectionName', 'recordId', 'version'],
    },
  ],
});
