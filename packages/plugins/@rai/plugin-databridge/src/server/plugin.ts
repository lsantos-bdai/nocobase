import { Plugin } from '@nocobase/server';
import { lookup, createPlatform, syncPlatform, destroyPlatform } from './actions';

export class PluginDatabridgeServer extends Plugin {
  async afterAdd() {}

  async beforeLoad() {
    // Define the databridge_platforms collection directly
    this.db.collection({
      name: 'databridge_platforms',
      title: 'Databridge Platforms',
      fields: [
        {
          type: 'bigInt',
          name: 'id',
          autoIncrement: true,
          primaryKey: true,
        },
        {
          type: 'string',
          name: 'name',
          unique: true,
        },
        {
          type: 'string',
          name: 'slug',
          unique: true,
        },
        {
          type: 'string',
          name: 'collectionName',
          unique: true,
        },
        {
          type: 'text',
          name: 'description',
        },
      ],
    });
  }

  async load() {
    // Register databridge resource with lookup action
    this.app.resourceManager.define({
      name: 'databridge',
      actions: {
        lookup,
      },
    });

    // Register custom actions for databridge_platforms (overrides default)
    this.app.resourceManager.registerActionHandler('databridge_platforms:create', createPlatform);
    this.app.resourceManager.registerActionHandler('databridge_platforms:sync', syncPlatform);
    this.app.resourceManager.registerActionHandler('databridge_platforms:destroy', destroyPlatform);

    // ACL permissions - register snippet for role-based access
    this.app.acl.registerSnippet({
      name: 'pm.databridge',
      actions: ['databridge_platforms:*', 'databridge:lookup'],
    });

    // Allow logged-in users to use lookup
    this.app.acl.allow('databridge', 'lookup', 'loggedIn');

    // Allow databridge_platforms actions for users with pm.databridge snippet
    this.app.acl.allow('databridge_platforms', ['list', 'get', 'create', 'update', 'destroy', 'sync'], 'loggedIn');
  }

  async install() {}

  async afterEnable() {}

  async afterDisable() {}

  async remove() {}
}

export default PluginDatabridgeServer;
