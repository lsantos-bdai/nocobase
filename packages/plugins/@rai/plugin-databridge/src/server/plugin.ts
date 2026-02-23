import { Plugin } from '@nocobase/server';
import { lookup, createPlatform, syncPlatform, destroyPlatform, listCollections, viewPlatform } from './actions';

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
    // Register databridge resource with lookup and listCollections actions
    this.app.resourceManager.define({
      name: 'databridge',
      actions: {
        lookup,
        listCollections,
      },
    });

    // Register custom actions for databridge_platforms (overrides default)
    this.app.resourceManager.registerActionHandler('databridge_platforms:create', createPlatform);
    this.app.resourceManager.registerActionHandler('databridge_platforms:sync', syncPlatform);
    this.app.resourceManager.registerActionHandler('databridge_platforms:destroy', destroyPlatform);
    this.app.resourceManager.registerActionHandler('databridge_platforms:view', viewPlatform);

    // ACL permissions - register snippet for role-based access
    this.app.acl.registerSnippet({
      name: 'pm.databridge',
      actions: ['databridge_platforms:*', 'databridge:lookup', 'databridge:listCollections'],
    });

    // Allow logged-in users to use lookup and listCollections
    this.app.acl.allow('databridge', ['lookup', 'listCollections'], 'loggedIn');

    // Allow databridge_platforms actions for users with pm.databridge snippet
    this.app.acl.allow('databridge_platforms', ['list', 'get', 'create', 'update', 'destroy', 'sync', 'view'], 'loggedIn');
  }

  async install() {}

  async afterEnable() {}

  async afterDisable() {}

  async remove() {}
}

export default PluginDatabridgeServer;
