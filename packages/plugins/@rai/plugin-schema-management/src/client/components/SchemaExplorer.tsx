import React from 'react';
import { CollectionSelector } from './CollectionSelector';
import { SchemaViewer } from './SchemaViewer';

export function SchemaExplorer() {
  const [selectedCollection, setSelectedCollection] = React.useState<string | null>(null);

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ marginBottom: 24 }}>Schema Management</h2>
      <div
        style={{
          display: 'flex',
          gap: 24,
          height: 'calc(100vh - 200px)',
          minHeight: 500,
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
    </div>
  );
}
