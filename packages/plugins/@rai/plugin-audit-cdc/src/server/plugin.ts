import { Plugin } from '@nocobase/server';
import {
  createBeforeUpdateHook,
  createBeforeDestroyHook,
  createAfterCreateHook,
  createAfterUpdateHook,
  createAfterDestroyHook,
} from './hooks';
import { history, snapshot, preview, rollback, configure, listConfig, listSnapshots } from './actions';

export class PluginAuditCdcServer extends Plugin {
  private hooksRegistered = false;

  async afterAdd() {}

  async beforeLoad() {
    // Import and register collections
    this.db.import({
      directory: require('path').resolve(__dirname, 'collections'),
    });
  }

  async load() {
    // Register resource and actions
    this.app.resourceManager.define({
      name: 'cdc',
      actions: {
        history,
        snapshot,
        preview,
        rollback,
        configure,
        listConfig,
        listSnapshots,
      },
    });

    // Register ACL permissions
    this.app.acl.registerSnippet({
      name: 'pm.audit-cdc',
      actions: [
        'cdc:history',
        'cdc:snapshot',
        'cdc:preview',
        'cdc:rollback',
        'cdc:configure',
        'cdc:listConfig',
        'cdc:listSnapshots',
      ],
    });

    // Allow read actions for logged-in users
    this.app.acl.allow('cdc', ['history', 'snapshot', 'preview', 'listSnapshots'], 'loggedIn');

    // Register GLOBAL hooks (not per-collection)
    // Hooks check shouldAuditCollection and isCollectionEnabled to decide whether to process
    this.registerGlobalHooks();
  }

  async install() {
    // Ensure collections are synced
    await this.db.sync();
  }

  async afterEnable() {
    // Re-register hooks after plugin is enabled
    if (!this.hooksRegistered) {
      this.registerGlobalHooks();
    }
  }

  async beforeDisable() {
    // Hooks will be cleaned up when db.off is called
  }

  async afterDisable() {}

  async remove() {}

  private registerGlobalHooks() {
    if (this.hooksRegistered) {
      return;
    }

    const db = this.db;
    const logger = this.app.logger;

    // Create hook handlers (no collectionName param - extracted from model)
    const beforeUpdate = createBeforeUpdateHook(db, logger);
    const afterUpdate = createAfterUpdateHook(db, logger);
    const beforeDestroy = createBeforeDestroyHook(db, logger);
    const afterDestroy = createAfterDestroyHook(db, logger);
    const afterCreate = createAfterCreateHook(db, logger);

    // Register GLOBAL hooks - these fire for ALL collections
    // Each hook checks shouldAuditCollection and isCollectionEnabled before processing
    db.on('beforeUpdate', beforeUpdate);
    db.on('afterUpdate', afterUpdate);
    db.on('beforeDestroy', beforeDestroy);
    db.on('afterDestroy', afterDestroy);
    db.on('afterCreate', afterCreate);

    this.hooksRegistered = true;
    console.log('[CDC DEBUG] Registered global hooks for CDC plugin');
  }
}

export default PluginAuditCdcServer;
