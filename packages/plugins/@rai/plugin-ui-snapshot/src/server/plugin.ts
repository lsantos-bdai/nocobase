import { Plugin } from '@nocobase/server';
import { create, deleteAction, exportPage, exportAll } from './actions';

export class PluginUiSnapshotServer extends Plugin {
  async afterAdd() {}

  async beforeLoad() {}

  async load() {
    // Register ui-snapshot resource with all actions
    this.app.resourceManager.define({
      name: 'ui-snapshot',
      actions: {
        create,
        delete: deleteAction,
        export: exportPage,
        exportAll,
      },
    });

    // Register ACL permissions
    this.app.acl.registerSnippet({
      name: 'pm.ui-snapshot',
      actions: [
        'ui-snapshot:create',
        'ui-snapshot:delete',
        'ui-snapshot:export',
        'ui-snapshot:exportAll',
      ],
    });

    // Allow logged-in users with appropriate permissions to use these actions
    this.app.acl.allow('ui-snapshot', ['create', 'delete', 'export', 'exportAll'], 'loggedIn');

    this.app.logger.info('UI Snapshot plugin loaded - API endpoints registered');
  }

  async install() {}

  async afterEnable() {}

  async afterDisable() {}

  async remove() {}
}

export default PluginUiSnapshotServer;
