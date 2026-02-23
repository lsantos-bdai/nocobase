import React from 'react';
import { SchemaComponent } from '@nocobase/client';
import { CreatePlatformButton } from './CreatePlatformButton';
import { PlatformsTable } from './PlatformsTable';

const schema = {
  type: 'void',
  name: 'databridge-platforms',
  'x-component': 'div',
  properties: {
    actions: {
      type: 'void',
      'x-component': 'Space',
      'x-component-props': {
        style: { marginBottom: 16 },
      },
      properties: {
        create: {
          type: 'void',
          'x-component': 'CreatePlatformButton',
        },
      },
    },
    table: {
      type: 'void',
      'x-component': 'PlatformsTable',
    },
  },
};

export function PlatformsManager() {
  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ marginBottom: 24 }}>Databridge Platforms</h2>
      <SchemaComponent schema={schema} components={{ CreatePlatformButton, PlatformsTable }} />
    </div>
  );
}
