import { Plugin } from '@nocobase/server';
import { Model } from '@nocobase/database';

// Collections to skip (system tables)
const EXCLUDED_PREFIXES = ['_', 'ui', 'cdc_', 'auth'];
const EXCLUDED_COLLECTIONS = new Set(['sessions', 'authenticators', 'verifications']);

export class PluginRealtimeSyncServer extends Plugin {
  private pendingChanges = new Map<string, { timeout: NodeJS.Timeout; excludeClient?: string }>();
  private readonly DEBOUNCE_MS = 100;

  async load() {
    console.log('[realtime-sync] Server plugin loading...');

    // Register WS message handlers
    this.app.on('ws:message:watch', this.handleWatch.bind(this));
    this.app.on('ws:message:unwatch', this.handleUnwatch.bind(this));

    // Hook into all collection changes
    this.db.on('afterCreate', this.onCollectionChange.bind(this));
    this.db.on('afterUpdate', this.onCollectionChange.bind(this));
    this.db.on('afterDestroy', this.onCollectionChange.bind(this));

    console.log('[realtime-sync] Server plugin loaded, hooks registered');
  }

  private shouldSkip(collectionName: string): boolean {
    if (EXCLUDED_COLLECTIONS.has(collectionName)) return true;
    for (const prefix of EXCLUDED_PREFIXES) {
      if (collectionName.startsWith(prefix)) return true;
    }
    return false;
  }

  private onCollectionChange(model: Model, options: any) {
    const collectionName = (model.constructor as any).collection?.name;
    console.log('[realtime-sync] onCollectionChange:', collectionName);
    if (!collectionName || this.shouldSkip(collectionName)) return;

    // Get client ID that initiated this change (to exclude from broadcast)
    const excludeClient = options.context?.__realtimeSyncClientId;

    // Debounce: clear existing timeout, set new one
    const existing = this.pendingChanges.get(collectionName);
    if (existing) clearTimeout(existing.timeout);

    this.pendingChanges.set(collectionName, {
      timeout: setTimeout(() => {
        this.broadcastChange(collectionName, excludeClient);
        this.pendingChanges.delete(collectionName);
      }, this.DEBOUNCE_MS),
      excludeClient,
    });
  }

  private broadcastChange(collection: string, excludeClient?: string) {
    console.log('[realtime-sync] Broadcasting change for:', collection);
    this.app.emit('ws:sendToTag', {
      tagKey: 'watching',
      tagValue: collection,
      message: {
        type: 'collection:changed',
        payload: { collection, excludeClient },
      },
    });
  }

  private handleWatch({ clientId, payload }: { clientId: string; payload: { collection: string } }) {
    console.log('[realtime-sync] handleWatch:', clientId, payload?.collection);
    this.app.emit('ws:setTag', {
      clientId,
      tagKey: 'watching',
      tagValue: payload.collection,
    });
  }

  private handleUnwatch({ clientId, payload }: { clientId: string; payload: { collection: string } }) {
    this.app.emit('ws:removeTag', {
      clientId,
      tagKey: `watching#${payload.collection}`,
    });
  }
}

export default PluginRealtimeSyncServer;
