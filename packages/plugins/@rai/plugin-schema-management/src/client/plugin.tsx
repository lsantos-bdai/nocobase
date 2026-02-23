import { Plugin } from '@nocobase/client';
import { SchemaExplorer } from './components';

export class PluginSchemaManagementClient extends Plugin {
  async load() {
    // Register settings page
    this.app.pluginSettingsManager.add('schema-management', {
      title: 'Schema Management',
      icon: 'FileTextOutlined',
      Component: SchemaExplorer,
      aclSnippet: 'pm.schema-management',
    });
  }
}

export default PluginSchemaManagementClient;
