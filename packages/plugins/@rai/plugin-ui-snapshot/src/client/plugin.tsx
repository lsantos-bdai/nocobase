import { Plugin } from '@nocobase/client';

export class PluginUiSnapshotClient extends Plugin {
  async load() {
    // API-only plugin - no client-side models
  }
}

export default PluginUiSnapshotClient;
