import { Plugin } from '@nocobase/server';
import { Model, Transaction } from 'sequelize';
import {
  lookup,
  createPlatform,
  syncPlatform,
  destroyPlatform,
  listCollections,
  viewPlatform,
  syncAll,
  syncCollection,
  removeCollection,
} from './actions';
import { DuplicateNamesError } from './errors/duplicate-names-error';

type HookHandler = (model: Model, options: { transaction?: Transaction }) => Promise<void>;

interface HookHandlers {
  afterCreate: HookHandler;
  afterUpdate: HookHandler;
  afterDestroy: HookHandler;
}

export class PluginDatabridgeServer extends Plugin {
  private hookCleanup: Map<string, () => void> = new Map();

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
        {
          type: 'json',
          name: 'registeredCollections',
          defaultValue: [],
        },
      ],
    });
  }

  async load() {
    // Sync the databridge_platforms collection to ensure schema is up to date
    const platformsCollection = this.db.getCollection('databridge_platforms');
    if (platformsCollection) {
      await platformsCollection.sync();
    }

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
    this.app.resourceManager.registerActionHandler('databridge_platforms:syncAll', syncAll);
    this.app.resourceManager.registerActionHandler('databridge_platforms:syncCollection', syncCollection);
    this.app.resourceManager.registerActionHandler('databridge_platforms:removeCollection', removeCollection);

    // ACL permissions - register snippet for role-based access
    this.app.acl.registerSnippet({
      name: 'pm.databridge',
      actions: ['databridge_platforms:*', 'databridge:lookup', 'databridge:listCollections'],
    });

    // Allow logged-in users to use lookup and listCollections
    this.app.acl.allow('databridge', ['lookup', 'listCollections'], 'loggedIn');

    // Allow databridge_platforms actions for users with pm.databridge snippet
    this.app.acl.allow(
      'databridge_platforms',
      ['list', 'get', 'create', 'update', 'destroy', 'sync', 'view', 'syncAll', 'syncCollection', 'removeCollection'],
      'loggedIn'
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
    // Get all platforms and their registered collections
    try {
      const platforms = await this.db.getRepository('databridge_platforms').find();
      const allCollections = new Set<string>();

      for (const platform of platforms) {
        const registered = platform.registeredCollections || [];
        for (const collName of registered) {
          allCollections.add(collName);
        }
      }

      // Register hooks for all collections
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

    const handlers: HookHandlers = {
      afterCreate: async (model: Model, options: { transaction?: Transaction }) => {
        const syncFn = async () => {
          try {
            await this.syncRecordToPlatforms(collectionName, model, 'create');
          } catch (err) {
            this.app.logger.error('DataBridge sync failed (afterCreate):', err);
          }
        };

        if (options.transaction) {
          options.transaction.afterCommit(syncFn);
        } else {
          await syncFn();
        }
      },

      afterUpdate: async (model: Model, options: { transaction?: Transaction }) => {
        // Only sync if name field changed
        const changed = (model as any).changed?.() || [];
        if (!changed.includes('name')) {
          return;
        }

        const syncFn = async () => {
          try {
            await this.syncRecordToPlatforms(collectionName, model, 'update');
          } catch (err) {
            this.app.logger.error('DataBridge sync failed (afterUpdate):', err);
          }
        };

        if (options.transaction) {
          options.transaction.afterCommit(syncFn);
        } else {
          await syncFn();
        }
      },

      afterDestroy: async (model: Model, options: { transaction?: Transaction }) => {
        const syncFn = async () => {
          try {
            await this.syncRecordToPlatforms(collectionName, model, 'destroy');
          } catch (err) {
            this.app.logger.error('DataBridge sync failed (afterDestroy):', err);
          }
        };

        if (options.transaction) {
          options.transaction.afterCommit(syncFn);
        } else {
          await syncFn();
        }
      },
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
    operation: 'create' | 'update' | 'destroy'
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
    const collectionRecord = await this.db.getRepository('collections').findOne({
      filter: { name: collectionName },
      fields: ['title'],
    });
    const collectionTitle = collectionRecord?.title || collectionName;

    for (const platform of platforms) {
      const lookupRepo = this.db.getRepository(platform.collectionName);
      if (!lookupRepo) {
        continue;
      }

      try {
        if (operation === 'destroy') {
          // Delete by assetId and collection
          await lookupRepo.destroy({
            filter: {
              assetId,
              collection: collectionName,
            },
          });
        } else if (operation === 'create') {
          if (!name) continue;
          // Create new entry
          await lookupRepo.create({
            values: {
              name,
              collection: collectionName,
              collectionTitle,
              assetId,
            },
          });
        } else if (operation === 'update') {
          if (!name) {
            // Name was cleared - remove the entry
            await lookupRepo.destroy({
              filter: {
                assetId,
                collection: collectionName,
              },
            });
          } else {
            // Update existing entry or create if doesn't exist
            const existing = await lookupRepo.findOne({
              filter: {
                assetId,
                collection: collectionName,
              },
            });

            if (existing) {
              await lookupRepo.update({
                filterByTk: existing.id,
                values: { name },
              });
            } else {
              await lookupRepo.create({
                values: {
                  name,
                  collection: collectionName,
                  collectionTitle,
                  assetId,
                },
              });
            }
          }
        }
      } catch (err: any) {
        // Log but don't throw - non-blocking
        if (err.name === 'SequelizeUniqueConstraintError') {
          this.app.logger.warn(
            `DataBridge: duplicate name '${name}' when syncing to platform '${platform.name}'`
          );
        } else {
          this.app.logger.error(`DataBridge: failed to sync to platform '${platform.name}':`, err);
        }
      }
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
