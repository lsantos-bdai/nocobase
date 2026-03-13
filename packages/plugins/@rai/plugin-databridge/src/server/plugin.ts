import { Plugin } from '@nocobase/server';
import { Model, Transaction } from 'sequelize';
import {
  get,
  getSchemaConformant,
  search,
  list,
  update,
  create,
  deleteAssets,
  createPlatform,
  addPlatformCollections,
  removePlatformCollections,
  destroyPlatform,
  listCollections,
  viewPlatform,
  syncAll,
  syncCollection,
  getPlatform,
  basic,
} from './actions';
import { DuplicateNamesError } from './errors/duplicate-names-error';
import { getCollectionTitle } from './utils';
import { parsePaginationParams, buildPaginatedMeta } from './utils/pagination';

type HookHandler = (model: Model, options: { transaction?: Transaction }) => Promise<void>;

interface HookHandlers {
  afterCreate: HookHandler;
  afterUpdate: HookHandler;
  afterDestroy: HookHandler;
}

export class PluginDatabridgeServer extends Plugin {
  private hookCleanup: Map<string, () => void> = new Map();

  async load() {
    // Sync the databridge_platforms collection to ensure schema is up to date
    const platformsCollection = this.db.getCollection('databridge_platforms');
    if (platformsCollection) {
      await platformsCollection.sync();
    }

    // Register databridge resource actions
    this.app.resourceManager.define({
      name: 'databridge',
      actions: {
        get,
        getSchemaConformant,
        search,
        list,
        listCollections,
        bulkUpdate: update,
        bulkCreate: create,
        bulkDelete: deleteAssets,
      },
    });

    // Register databridgeBasic resource actions (platform-free API)
    this.app.resourceManager.define({
      name: 'databridgeBasic',
      actions: {
        get: basic.basicGet,
        getSchemaConformant: basic.basicGetSchemaConformant,
        search: basic.basicSearch,
        bulkCreate: basic.basicCreate,
        bulkUpdate: basic.basicUpdate,
        bulkDelete: basic.basicDelete,
      },
    });

    // Register custom actions for databridge_platforms (overrides default)
    this.app.resourceManager.registerActionHandler('databridge_platforms:list', async (ctx: any, next: any) => {
      const { page: pageStr, pageSize: pageSizeStr } = ctx.request.query as {
        page?: string;
        pageSize?: string;
      };
      const { page, pageSize } = parsePaginationParams(ctx, pageStr, pageSizeStr);

      const repo = ctx.db.getRepository('databridge_platforms');
      const [data, count] = await Promise.all([
        repo.find({
          limit: pageSize,
          offset: (page - 1) * pageSize,
          sort: ['name'],
        }),
        repo.count(),
      ]);

      ctx.body = {
        data,
        meta: buildPaginatedMeta(page, pageSize, count),
      };
      ctx.withoutDataWrapping = true;
      await next();
    });
    this.app.resourceManager.registerActionHandler('databridge_platforms:get', getPlatform as any);
    this.app.resourceManager.registerActionHandler('databridge_platforms:create', createPlatform as any);
    this.app.resourceManager.registerActionHandler('databridge_platforms:add', addPlatformCollections as any);
    this.app.resourceManager.registerActionHandler('databridge_platforms:remove', removePlatformCollections as any);
    this.app.resourceManager.registerActionHandler('databridge_platforms:deletePlatform', destroyPlatform as any);
    this.app.resourceManager.registerActionHandler('databridge_platforms:view', viewPlatform as any);
    this.app.resourceManager.registerActionHandler('databridge_platforms:syncAll', syncAll as any);
    this.app.resourceManager.registerActionHandler('databridge_platforms:syncCollection', syncCollection as any);

    // ACL permissions - register snippet for role-based access
    this.app.acl.registerSnippet({
      name: 'pm.databridge',
      actions: [
        'databridge_platforms:*',
        'databridge:get',
        'databridge:getSchemaConformant',
        'databridge:search',
        'databridge:list',
        'databridge:listCollections',
        'databridge:bulkUpdate',
        'databridge:bulkCreate',
        'databridge:bulkDelete',
        'databridgeBasic:get',
        'databridgeBasic:getSchemaConformant',
        'databridgeBasic:search',
        'databridgeBasic:bulkCreate',
        'databridgeBasic:bulkUpdate',
        'databridgeBasic:bulkDelete',
      ],
    });

    // Allow logged-in users to use databridge actions
    this.app.acl.allow('databridge', ['get', 'getSchemaConformant', 'search', 'list', 'listCollections', 'bulkUpdate', 'bulkCreate', 'bulkDelete'], 'loggedIn');

    // Allow logged-in users to use databridgeBasic actions
    this.app.acl.allow('databridgeBasic', ['get', 'getSchemaConformant', 'search', 'bulkCreate', 'bulkUpdate', 'bulkDelete'], 'loggedIn');

    // Allow databridge_platforms actions for users with pm.databridge snippet
    this.app.acl.allow(
      'databridge_platforms',
      ['list', 'get', 'create', 'update', 'deletePlatform', 'add', 'remove', 'view', 'syncAll', 'syncCollection'],
      'loggedIn',
    );

    // Register custom error handler for duplicate names
    const errorHandlerPlugin = this.app.pm.get<any>('error-handler');
    errorHandlerPlugin.errorHandler.register(
      (err: Error) => err instanceof DuplicateNamesError,
      (err: DuplicateNamesError, ctx: any) => {
        ctx.status = err.status;
        ctx.body = {
          errors: [{ message: err.message }],
          duplicates: err.duplicates,
        };
      },
    );

    // Set up event hooks for registered collections
    await this.setupCollectionHooks();
  }

  private async setupCollectionHooks() {
    try {
      const platforms = await this.db.getRepository('databridge_platforms').find();
      const allCollections = new Set<string>();

      for (const platform of platforms) {
        const registered = platform.registeredCollections || [];
        for (const collName of registered) {
          allCollections.add(collName);
        }
      }

      for (const collName of allCollections) {
        this.registerCollectionHooks(collName);
      }
    } catch (err) {
      // Table may not exist yet during installation
      this.app.logger.debug('Could not set up collection hooks - table may not exist yet');
    }
  }

  registerCollectionHooks(collectionName: string) {
    // Avoid duplicate registration
    if (this.hookCleanup.has(collectionName)) {
      return;
    }

    const createSyncHandler = (operation: 'create' | 'update' | 'destroy'): HookHandler => {
      return async (model: Model, options: { transaction?: Transaction }) => {
        // For updates, only sync if name field changed
        if (operation === 'update') {
          const changed = (model as any).changed?.() || [];
          if (!changed.includes('name')) {
            return;
          }
        }

        const syncFn = async () => {
          try {
            await this.syncRecordToPlatforms(collectionName, model, operation);
          } catch (err) {
            this.app.logger.error(
              `DataBridge sync failed (after${operation.charAt(0).toUpperCase() + operation.slice(1)}):`,
              err,
            );
          }
        };

        if (options.transaction) {
          options.transaction.afterCommit(syncFn);
        } else {
          await syncFn();
        }
      };
    };

    const handlers: HookHandlers = {
      afterCreate: createSyncHandler('create'),
      afterUpdate: createSyncHandler('update'),
      afterDestroy: createSyncHandler('destroy'),
    };

    this.db.on(`${collectionName}.afterCreate`, handlers.afterCreate);
    this.db.on(`${collectionName}.afterUpdate`, handlers.afterUpdate);
    this.db.on(`${collectionName}.afterDestroy`, handlers.afterDestroy);

    // Store cleanup function
    this.hookCleanup.set(collectionName, () => {
      this.db.off(`${collectionName}.afterCreate`, handlers.afterCreate);
      this.db.off(`${collectionName}.afterUpdate`, handlers.afterUpdate);
      this.db.off(`${collectionName}.afterDestroy`, handlers.afterDestroy);
    });

    this.app.logger.info(`DataBridge: registered hooks for collection '${collectionName}'`);
  }

  unregisterCollectionHooks(collectionName: string) {
    const cleanup = this.hookCleanup.get(collectionName);
    if (cleanup) {
      cleanup();
      this.hookCleanup.delete(collectionName);
      this.app.logger.info(`DataBridge: unregistered hooks for collection '${collectionName}'`);
    }
  }

  private async syncRecordToPlatforms(
    collectionName: string,
    model: Model,
    operation: 'create' | 'update' | 'destroy',
  ) {
    const record = model.get({ plain: true }) as { id: number | string; name?: string };
    const assetId = String(record.id);
    const name = record.name;

    // Get all platforms that have this collection registered
    const platforms = await this.db.getRepository('databridge_platforms').find({
      filter: {
        registeredCollections: {
          $contains: collectionName,
        },
      },
    });

    if (platforms.length === 0) {
      return;
    }

    // Get collection title
    const collectionTitle = await getCollectionTitle(this.db, collectionName);

    for (const platform of platforms) {
      const lookupRepo = this.db.getRepository(platform.collectionName);
      if (!lookupRepo) {
        continue;
      }

      try {
        await this.handleSyncOperation(lookupRepo, operation, {
          assetId,
          name,
          collectionName,
          collectionTitle,
        });
      } catch (err: any) {
        this.logSyncError(err, name, platform.name);
      }
    }
  }

  private async handleSyncOperation(
    lookupRepo: any,
    operation: 'create' | 'update' | 'destroy',
    data: { assetId: string; name?: string; collectionName: string; collectionTitle: string },
  ) {
    const { assetId, name, collectionName, collectionTitle } = data;
    const filter = { assetId, collection: collectionName };

    if (operation === 'destroy') {
      await lookupRepo.destroy({ filter });
      return;
    }

    if (operation === 'create') {
      if (!name) return;
      await lookupRepo.create({
        values: { name, collection: collectionName, collectionTitle, assetId },
      });
      return;
    }

    // operation === 'update'
    if (!name) {
      // Name was cleared - remove the entry
      await lookupRepo.destroy({ filter });
      return;
    }

    // Update existing entry or create if doesn't exist
    const existing = await lookupRepo.findOne({ filter });
    if (existing) {
      await lookupRepo.update({
        filterByTk: existing.id,
        values: { name },
      });
    } else {
      await lookupRepo.create({
        values: { name, collection: collectionName, collectionTitle, assetId },
      });
    }
  }

  private logSyncError(err: any, name: string | undefined, platformName: string) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      this.app.logger.warn(`DataBridge: duplicate name '${name}' when syncing to platform '${platformName}'`);
    } else {
      this.app.logger.error(`DataBridge: failed to sync to platform '${platformName}':`, err);
    }
  }

  async install() {}

  async afterEnable() {
    // Re-setup hooks when plugin is enabled
    await this.setupCollectionHooks();
  }

  async beforeDisable() {
    // Clean up all hooks
    for (const cleanup of this.hookCleanup.values()) {
      cleanup();
    }
    this.hookCleanup.clear();
    this.app.logger.info('DataBridge: all hooks cleaned up');
  }

  async afterDisable() {}

  async remove() {}
}

export default PluginDatabridgeServer;
