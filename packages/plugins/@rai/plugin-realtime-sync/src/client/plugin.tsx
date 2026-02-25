import React, { useEffect, useRef } from 'react';
import { Plugin, useDataBlockRequest, useDataBlockProps } from '@nocobase/client';

// Simple wrapper that tracks when a table block renders and subscribes to updates
const createBlockWrapper = (OriginalComponent: React.ComponentType<any>, blockType: string) => {
  const WrappedComponent: React.FC<any> = (props) => {
    console.log(`[realtime-sync] ${blockType} rendering with props:`, {
      collection: props.collection,
      association: props.association,
      dataSource: props.dataSource,
    });

    return (
      <>
        <div style={{
          background: 'red',
          color: 'white',
          padding: '4px 8px',
          fontSize: '12px',
          fontWeight: 'bold'
        }}>
          🔴 REALTIME SYNC: {blockType} - {props.collection || props.association || 'unknown'}
        </div>
        <OriginalComponent {...props} />
      </>
    );
  };

  WrappedComponent.displayName = `Realtime${blockType}`;
  return WrappedComponent;
};

export class PluginRealtimeSyncClient extends Plugin {
  async load() {
    console.log('[realtime-sync] Client plugin loading...');

    // Wrap the specific block providers that are used in schemas
    const blockProviders = [
      'TableBlockProvider',
      'FormBlockProvider',
      'DetailsBlockProvider',
      'FilterFormBlockProvider',
    ];

    for (const providerName of blockProviders) {
      const Original = (this.app as any).components?.[providerName];
      if (Original) {
        console.log(`[realtime-sync] Wrapping ${providerName}`);
        const Wrapped = createBlockWrapper(Original, providerName);
        this.app.addComponents({ [providerName]: Wrapped });
      } else {
        console.log(`[realtime-sync] ${providerName} not found in app.components`);
      }
    }
  }
}

export default PluginRealtimeSyncClient;
