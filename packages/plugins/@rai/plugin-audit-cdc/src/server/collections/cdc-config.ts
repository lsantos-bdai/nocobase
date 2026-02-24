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
  ],
});
