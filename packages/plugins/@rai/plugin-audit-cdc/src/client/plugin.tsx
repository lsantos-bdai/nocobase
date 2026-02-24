import { Plugin } from '@nocobase/client';
import { CDCConfigPage } from './components/CDCConfigPage';

export class PluginAuditCdcClient extends Plugin {
  async load() {
    this.app.pluginSettingsManager.add('audit-cdc', {
      title: 'Audit CDC',
      icon: 'HistoryOutlined',
      Component: CDCConfigPage,
      aclSnippet: 'pm.audit-cdc',
    });
  }
}

export default PluginAuditCdcClient;
