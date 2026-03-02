import React from 'react';
import { Tabs } from 'antd';
import { SchemaTab } from './SchemaTab';
import { SchemaMigrator } from './SchemaMigrator';
import { DataTab } from './DataTab';

export function SchemaExplorer() {
  const tabItems = [
    {
      key: 'schema',
      label: 'Schema',
      children: <SchemaTab />,
    },
    {
      key: 'migrate',
      label: 'Migrate',
      children: <SchemaMigrator />,
    },
    {
      key: 'data',
      label: 'Data',
      children: <DataTab />,
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ marginBottom: 24 }}>Schema Management</h2>
      <Tabs defaultActiveKey="schema" items={tabItems} />
    </div>
  );
}
