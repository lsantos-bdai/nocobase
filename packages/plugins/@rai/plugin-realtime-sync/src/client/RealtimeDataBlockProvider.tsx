import React from 'react';
import { RealtimeSyncSubscriber } from './RealtimeSyncSubscriber';

// Will be set during plugin load
let OriginalDataBlockProvider: React.ComponentType<any>;

export const setOriginalDataBlockProvider = (component: React.ComponentType<any>) => {
  OriginalDataBlockProvider = component;
};

export const RealtimeDataBlockProvider: React.FC<any> = (props) => {
  console.log('[realtime-sync] RealtimeDataBlockProvider rendering with props:', Object.keys(props));

  // TEMPORARY: Add visible indicator to prove component is rendering
  return (
    <OriginalDataBlockProvider {...props}>
      <div style={{ background: 'red', color: 'white', padding: '2px 8px', fontSize: '10px', position: 'absolute', top: 0, right: 0, zIndex: 9999 }}>
        REALTIME
      </div>
      <RealtimeSyncSubscriber />
      {props.children}
    </OriginalDataBlockProvider>
  );
};

RealtimeDataBlockProvider.displayName = 'DataBlockProvider';
