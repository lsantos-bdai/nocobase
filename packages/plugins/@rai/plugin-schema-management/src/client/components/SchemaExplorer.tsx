import React from 'react';
import { Tabs } from 'antd';
import { CollectionSelector } from './CollectionSelector';
import { SchemaViewer } from './SchemaViewer';
import { SchemaImporter } from './SchemaImporter';

export function SchemaExplorer() {
  const [selectedCollection, setSelectedCollection] = React.useState<string | null>(null);

  const tabItems = [
    {
      key: 'export',
      label: 'Export',
      children: (
        <div
          style={{
            display: 'flex',
            gap: 24,
            height: 'calc(100vh - 280px)',
            minHeight: 400,
          }}
        >
          <div
            style={{
              width: 300,
              flexShrink: 0,
              border: '1px solid #f0f0f0',
              borderRadius: 8,
              padding: 16,
              backgroundColor: '#fafafa',
            }}
          >
            <h4 style={{ margin: '0 0 12px 0', color: '#666' }}>Collections</h4>
            <CollectionSelector selectedCollection={selectedCollection} onSelect={setSelectedCollection} />
          </div>
          <div
            style={{
              flex: 1,
              border: '1px solid #f0f0f0',
              borderRadius: 8,
              padding: 16,
              backgroundColor: '#fff',
            }}
          >
            <SchemaViewer collectionName={selectedCollection} />
          </div>
        </div>
      ),
    },
    {
      key: 'import',
      label: 'Import',
      children: <SchemaImporter />,
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ marginBottom: 24 }}>Schema Management</h2>
      <Tabs defaultActiveKey="export" items={tabItems} />
    </div>
  );
}
