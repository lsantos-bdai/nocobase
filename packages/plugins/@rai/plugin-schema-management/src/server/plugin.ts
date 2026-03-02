import { Plugin } from '@nocobase/server';
import { listCollections, generate, importSpec } from './actions';

export class PluginSchemaManagementServer extends Plugin {
  async afterAdd() {}

  async beforeLoad() {}

  async load() {
    // Register schema-management resource with actions
    this.app.resourceManager.define({
      name: 'schema-management',
      actions: {
        listCollections,
        generate,
        import: importSpec,
      },
    });

    // ACL permissions - register snippet for role-based access
    this.app.acl.registerSnippet({
      name: 'pm.schema-management',
      actions: [
        'schema-management:listCollections',
        'schema-management:generate',
        'schema-management:import',
      ],
    });

    // Allow logged-in users with pm.schema-management snippet to use these actions
    this.app.acl.allow('schema-management', ['listCollections', 'generate', 'import'], 'loggedIn');
  }

  async install() {}

  async afterEnable() {}

  async afterDisable() {}

  async remove() {}
}

export default PluginSchemaManagementServer;
