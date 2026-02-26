import { defineCollection } from '@nocobase/database';

export default defineCollection({
  name: 'databridge_platforms',
  title: 'Databridge Platforms',
  dumpRules: {
    group: 'required',
  },
  fields: [
    {
      type: 'string',
      name: 'name',
      unique: true,
      interface: 'input',
      uiSchema: { title: 'Name', required: true },
    },
    {
      type: 'string',
      name: 'slug',
      unique: true,
      interface: 'input',
      uiSchema: { title: 'Slug', required: true },
    },
    {
      type: 'string',
      name: 'collectionName',
      unique: true,
      interface: 'input',
      uiSchema: { title: 'Collection Name' },
    },
    {
      type: 'text',
      name: 'description',
      interface: 'textarea',
      uiSchema: { title: 'Description' },
    },
    {
      type: 'jsonb',
      name: 'registeredCollections',
      defaultValue: [],
    },
  ],
});
