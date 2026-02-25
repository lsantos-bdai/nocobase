import { defineCollection } from '@nocobase/database';

export default defineCollection({
  name: 'cdc_config',
  title: 'CDC Configuration',
  autoGenId: false,
  filterTargetKey: 'collectionName',
  dumpRules: {
    group: 'required',
  },
  fields: [
    {
      type: 'string',
      name: 'collectionName',
      unique: true,
      primaryKey: true,
    },
    {
      type: 'boolean',
      name: 'enabled',
      defaultValue: true,
    },
    {
      type: 'integer',
      name: 'retentionDays',
      // null = forever
    },
    {
      type: 'integer',
      name: 'maxVersions',
      // null = unlimited
    },
    {
      type: 'json',
      name: 'capturedRecords',
      // Array of {id: string, name: string} - all historical id/name pairs
      defaultValue: [],
    },
    {
      type: 'json',
      name: 'capturedFields',
      // Array of field names that have appeared in changedFields
      defaultValue: [],
    },
  ],
});
