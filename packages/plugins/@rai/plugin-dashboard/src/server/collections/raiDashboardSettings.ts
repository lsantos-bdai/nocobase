import { defineCollection } from '@nocobase/database';

export default defineCollection({
  name: 'raiDashboardSettings',
  migrationRules: ['overwrite', 'schema-only'],
  fields: [
    { type: 'string', name: 'projectId' },
    { type: 'string', name: 'dataset' },
    { type: 'string', name: 'table', defaultValue: 'sessions' },
    { type: 'string', name: 'location', defaultValue: 'us-central1' },
    { type: 'text', name: 'accessToken', defaultValue: '{{$env.GCP_ACCESS_TOKEN}}' },
  ],
});
