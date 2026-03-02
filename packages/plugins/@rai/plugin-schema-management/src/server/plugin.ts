import { Plugin } from '@nocobase/server';
import { listCollections, generate, importSpec, diff, migrate, exportData, exportDataGet, importData } from './actions';

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
        diff,
        migrate,
        export: exportData,
        exportGet: exportDataGet,
        importData,
      },
    });

    // ACL permissions - register snippet for role-based access
    this.app.acl.registerSnippet({
      name: 'pm.schema-management',
      actions: [
        'schema-management:listCollections',
        'schema-management:generate',
        'schema-management:import',
        'schema-management:diff',
        'schema-management:migrate',
        'schema-management:export',
        'schema-management:exportGet',
        'schema-management:importData',
      ],
    });

    // Allow logged-in users with pm.schema-management snippet to use these actions
    this.app.acl.allow('schema-management', ['listCollections', 'generate', 'import', 'diff', 'migrate', 'export', 'exportGet', 'importData'], 'loggedIn');
  }

  async install() {}

  async afterEnable() {}

  async afterDisable() {}

  async remove() {}
}

export default PluginSchemaManagementServer;
