import { Plugin } from '@nocobase/client';
import { PlatformsManager } from './components/PlatformsManager';

export class PluginDatabridgeClient extends Plugin {
  async load() {
    // Register settings page
    this.app.pluginSettingsManager.add('databridge', {
      title: 'Databridge',
      icon: 'ApiOutlined',
      Component: PlatformsManager,
      aclSnippet: 'pm.databridge',
    });
  }
}

export default PluginDatabridgeClient;
