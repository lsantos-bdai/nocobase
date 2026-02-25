import React, { useEffect, useRef } from 'react';
import { useApp, useDataBlockProps, useDataBlockRequest } from '@nocobase/client';

export const RealtimeSyncSubscriber: React.FC = () => {
  console.log('[realtime-sync] RealtimeSyncSubscriber rendering');

  const app = useApp();
  const blockProps = useDataBlockProps();
  const request = useDataBlockRequest();
  const clientIdRef = useRef<string>(crypto.randomUUID());

  const collection = blockProps?.collection;
  const collectionName = typeof collection === 'string' ? collection : collection?.name;

  console.log('[realtime-sync] blockProps:', blockProps, 'collectionName:', collectionName, 'request:', request);

  useEffect(() => {
    if (!collectionName || !app.ws?.enabled) {
      console.log('[realtime-sync] Skipping subscription:', { collectionName, wsEnabled: app.ws?.enabled });
      return;
    }

    console.log('[realtime-sync] Subscribing to collection:', collectionName);

    // Subscribe to collection changes
    app.ws.send(
      JSON.stringify({
        type: 'watch',
        payload: { collection: collectionName },
      }),
    );

    const handler = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'collection:changed') {
          console.log('[realtime-sync] Received collection:changed:', data.payload);
          if (
            data.payload?.collection === collectionName &&
            data.payload?.excludeClient !== clientIdRef.current
          ) {
            console.log('[realtime-sync] Refreshing data block for:', collectionName);
            request?.refresh?.();
          }
        }
      } catch {
        // Ignore non-JSON messages (like "ping")
      }
    };

    app.ws.on('message', handler);

    return () => {
      console.log('[realtime-sync] Unsubscribing from:', collectionName);
      app.ws.off('message', handler);
      app.ws.send(
        JSON.stringify({
          type: 'unwatch',
          payload: { collection: collectionName },
        }),
      );
    };
  }, [collectionName, app.ws, request]);

  return null;
};
