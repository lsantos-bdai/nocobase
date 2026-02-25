import { Context, Next } from '@nocobase/actions';
import { shouldAuditCollection } from '../utils/snapshot-helpers';

/**
 * POST /api/cdc:configure
 * Body:
 *   - collectionName: Collection name (required)
 *   - enabled: boolean (optional) - whether to audit this collection
 *   - retentionDays: number (optional) - how long to keep snapshots (null = forever)
 *   - maxVersions: number (optional) - max versions to keep per record (null = unlimited)
 */
export async function configure(ctx: Context, next: Next) {
  const body = ctx.request.body as {
    collectionName?: string;
    enabled?: boolean;
    retentionDays?: number | null;
    maxVersions?: number | null;
  };

  const { collectionName, enabled, retentionDays, maxVersions } = body;

  if (!collectionName) {
    ctx.throw(400, 'collectionName is required');
  }

  // Check if the collection is in the excluded list
  if (!shouldAuditCollection(collectionName)) {
    ctx.throw(400, `Collection '${collectionName}' cannot be configured (system collection)`);
  }

  // Check if collection exists
  const collection = ctx.db.getCollection(collectionName);
  if (!collection) {
    ctx.throw(404, `Collection '${collectionName}' not found`);
  }

  const configRepo = ctx.db.getRepository('cdc_config');

  // Check if config already exists
  let config = await configRepo.findOne({
    filter: { collectionName },
  });

  const values: Record<string, unknown> = {};
  if (enabled !== undefined) values.enabled = enabled;
  if (retentionDays !== undefined) values.retentionDays = retentionDays;
  if (maxVersions !== undefined) values.maxVersions = maxVersions;

  if (config) {
    // Update existing config
    await configRepo.update({
      filterByTk: collectionName,
      values,
    });
    config = await configRepo.findOne({
      filter: { collectionName },
    });
  } else {
    // Create new config
    config = await configRepo.create({
      values: {
        collectionName,
        enabled: enabled ?? true,
        retentionDays: retentionDays ?? null,
        maxVersions: maxVersions ?? null,
      },
    });
  }

  ctx.body = {
    collectionName: config.get('collectionName'),
    enabled: config.get('enabled'),
    retentionDays: config.get('retentionDays'),
    maxVersions: config.get('maxVersions'),
  };

  await next();
}

/**
 * GET /api/cdc:listConfig
 * Returns all auditable collections with their CDC configuration and stats
 */
export async function listConfig(ctx: Context, next: Next) {
  const configRepo = ctx.db.getRepository('cdc_config');
  const snapshotRepo = ctx.db.getRepository('cdc_snapshots');

  // Get all existing configs
  const existingConfigs = await configRepo.find({
    sort: ['collectionName'],
  });

  const configMap = new Map<string, Record<string, unknown>>();
  for (const c of existingConfigs) {
    configMap.set(c.get('collectionName') as string, {
      collectionName: c.get('collectionName'),
      enabled: c.get('enabled'),
      retentionDays: c.get('retentionDays'),
      maxVersions: c.get('maxVersions'),
      capturedRecords: c.get('capturedRecords') || [],
      capturedFields: c.get('capturedFields') || [],
    });
  }

  // Get user-defined collections from the collections table (not ctx.db.collections which includes system collections)
  // Filter out hidden collections (junction tables, internal tables)
  const allCollections = await ctx.db.getRepository('collections').find({
    fields: ['name', 'title'],
    filter: {
      hidden: false,
    },
  });

  const configs: Array<{
    collectionName: string;
    collectionTitle: string;
    enabled: boolean;
    retentionDays: number | null;
    maxVersions: number | null;
    capturedRecords: Array<{ id: string; name: string }>;
    capturedFields: string[];
  }> = [];

  for (const coll of allCollections) {
    const name = coll.name as string;

    // Skip CDC's own tables
    if (name === 'cdc_snapshots' || name === 'cdc_config') {
      continue;
    }

    const collectionTitle = (coll.title as string) || name;

    const existing = configMap.get(name);
    if (existing) {
      configs.push({
        ...existing,
        collectionTitle,
      } as any);
    } else {
      // No config = not being tracked
      configs.push({
        collectionName: name,
        collectionTitle,
        enabled: false,
        retentionDays: null,
        maxVersions: null,
        capturedRecords: [],
        capturedFields: [],
      });
    }
  }

  // Sort by collection title
  configs.sort((a, b) => a.collectionTitle.localeCompare(b.collectionTitle));

  // Get stats
  const totalSnapshots = await snapshotRepo.count();
  const enabledCollections = configs.filter((c) => c.enabled).length;

  // Disable NocoBase's automatic { data: ... } wrapping
  ctx.withoutDataWrapping = true;
  ctx.body = {
    configs,
    stats: {
      totalSnapshots,
      totalCollections: configs.length,
      enabledCollections,
    },
  };

  await next();
}

/**
 * GET /api/cdc:listSnapshots
 * Query params:
 *   - collection: Collection name (optional - if not provided, returns all collections)
 *   - page: Page number (default: 1)
 *   - pageSize: Number of items per page (default: 20)
 *   - operation: Filter by operation type ('create' | 'update' | 'destroy')
 *   - startDate: Filter snapshots created after this date (ISO string)
 *   - endDate: Filter snapshots created before this date (ISO string)
 *   - recordId: Filter by specific record ID
 */
export async function listSnapshots(ctx: Context, next: Next) {
  const {
    collection,
    page = 1,
    pageSize = 20,
    operation,
    startDate,
    endDate,
    recordId,
    changedField,
  } = ctx.action.params;

  const snapshotRepo = ctx.db.getRepository('cdc_snapshots');

  // Build filter
  const filter: Record<string, unknown> = {};

  // If collection is specified, filter by it
  if (collection) {
    filter.collectionName = collection;
  }

  if (operation) {
    filter.operation = operation;
  }

  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) {
      (filter.createdAt as Record<string, unknown>)['$gte'] = new Date(startDate);
    }
    if (endDate) {
      (filter.createdAt as Record<string, unknown>)['$lte'] = new Date(endDate);
    }
  }

  if (recordId) {
    filter.recordId = recordId;
  }

  if (changedField) {
    // Filter snapshots where changedFields JSON array contains the specified field
    filter.changedFields = { $anyOf: [changedField] };
  }

  // Get total count
  const totalCount = await snapshotRepo.count({ filter });

  const snapshots = await snapshotRepo.find({
    filter,
    sort: ['-createdAt'],
    limit: Number(pageSize),
    offset: (Number(page) - 1) * Number(pageSize),
    appends: ['user'],
  });

  // Get collection titles map when returning all collections
  const collectionTitles = collection ? {} : await getCollectionTitles(ctx.db);

  // Resolve field labels and related values
  // When collection is specified: flat structure (backward compatible)
  // When no collection: nested by collection name
  let fieldLabels: Record<string, unknown> = {};
  let relatedValues: Record<string, unknown> = {};

  if (collection) {
    // Single collection - flat structure for backward compatibility
    const metadata = await resolveFieldMetadata(ctx.db, collection, snapshots);
    fieldLabels = metadata.fieldLabels;
    relatedValues = metadata.relatedValues;
  } else {
    // All collections - nested by collection name
    const collectionsInSnapshots = new Set<string>();
    for (const s of snapshots) {
      collectionsInSnapshots.add(s.get('collectionName') as string);
    }

    for (const collName of collectionsInSnapshots) {
      const collSnapshots = snapshots.filter((s) => s.get('collectionName') === collName);
      const metadata = await resolveFieldMetadata(ctx.db, collName, collSnapshots);
      (fieldLabels as Record<string, Record<string, string>>)[collName] = metadata.fieldLabels;
      (relatedValues as Record<string, Record<string, Record<string, string>>>)[collName] = metadata.relatedValues;
    }
  }

  const data = snapshots.map((snapshot) => {
    const afterData = snapshot.get('afterData') as Record<string, unknown> | null;
    const beforeData = snapshot.get('beforeData') as Record<string, unknown> | null;
    const user = snapshot.get('user') as Record<string, unknown> | null;
    const collectionName = snapshot.get('collectionName') as string;

    // Get user name from the user relationship (works for both GUI and API key requests)
    let userName = null;
    if (user) {
      userName = user.nickname || user.username || user.email || `User ${user.id}`;
    }

    return {
      id: snapshot.get('id'),
      recordId: snapshot.get('recordId'),
      recordName: getRecordName(afterData || beforeData),
      collectionName,
      collectionTitle: collectionTitles[collectionName] || collectionName,
      operation: snapshot.get('operation'),
      beforeData,
      afterData,
      changedFields: snapshot.get('changedFields'),
      userId: snapshot.get('userId'),
      isApiKey: snapshot.get('isApiKey') || false,
      userName,
      createdAt: snapshot.get('createdAt'),
      version: snapshot.get('version'),
    };
  });

  ctx.withoutDataWrapping = true;
  ctx.body = {
    data,
    fieldLabels,
    relatedValues,
    meta: {
      total: totalCount,
      page: Number(page),
      pageSize: Number(pageSize),
      totalPages: Math.ceil(totalCount / pageSize),
    },
  };

  await next();
}

/**
 * Get collection titles map from the collections table
 */
async function getCollectionTitles(db: any): Promise<Record<string, string>> {
  const titles: Record<string, string> = {};
  try {
    const collections = await db.getRepository('collections').find({
      fields: ['name', 'title'],
    });
    for (const coll of collections) {
      titles[coll.name as string] = (coll.title as string) || (coll.name as string);
    }
  } catch (err) {
    console.warn('Failed to fetch collection titles:', err);
  }
  return titles;
}

function getRecordName(data: Record<string, unknown> | null): string {
  if (!data) return 'Unknown';
  return String(data.name || data.title || data.label || data.nickname || data.id || 'Unknown');
}

/**
 * Resolves field metadata for a collection:
 * - fieldLabels: Maps field names to their human-readable titles
 * - relatedValues: For association fields, maps IDs to display values
 */
export async function resolveFieldMetadata(
  db: any,
  collectionName: string,
  snapshots: any[]
): Promise<{
  fieldLabels: Record<string, string>;
  relatedValues: Record<string, Record<string, string>>;
}> {
  const fieldLabels: Record<string, string> = {};
  const relatedValues: Record<string, Record<string, string>> = {};

  try {
    const collection = db.getCollection(collectionName);
    if (!collection) {
      return { fieldLabels, relatedValues };
    }

    const fields = collection.fields;

    // Build field labels map and identify association fields
    const associationFields: Array<{
      name: string;
      targetCollection: string;
      foreignKey: string;
      isArray: boolean;
    }> = [];

    for (const [name, field] of fields) {
      const options = field.options || {};

      // Get human-readable label from uiSchema
      const label = options.uiSchema?.title || options.uiSchema?.['x-component-props']?.title;
      if (label) {
        fieldLabels[name] = label;
      }

      // Identify association fields (belongsTo, hasOne, hasMany, belongsToMany)
      if (['belongsTo', 'hasOne', 'hasMany', 'belongsToMany'].includes(field.type)) {
        const targetCollection = options.target;
        const foreignKey = options.foreignKey || `${name}Id`;
        const isArray = ['hasMany', 'belongsToMany'].includes(field.type);
        if (targetCollection) {
          associationFields.push({ name, targetCollection, foreignKey, isArray });
          // Also label the foreign key field
          if (label) {
            fieldLabels[foreignKey] = label;
          }
        }
      }
    }

    // For association fields, collect all IDs from snapshot data and fetch display values
    for (const assoc of associationFields) {
      const ids = new Set<string>();

      for (const snapshot of snapshots) {
        const beforeData = snapshot.get('beforeData') as Record<string, unknown> | null;
        const afterData = snapshot.get('afterData') as Record<string, unknown> | null;

        if (assoc.isArray) {
          // For array fields (hasMany/belongsToMany), extract IDs from array items
          for (const data of [beforeData, afterData]) {
            const arr = data?.[assoc.name];
            if (Array.isArray(arr)) {
              for (const item of arr) {
                const itemId = typeof item === 'object' && item !== null ? (item as any).id : item;
                if (itemId != null) {
                  ids.add(String(itemId));
                }
              }
            }
          }
        } else {
          // Check both the association field name and the foreign key
          for (const key of [assoc.name, assoc.foreignKey]) {
            const beforeId = beforeData?.[key];
            const afterId = afterData?.[key];
            if (beforeId !== null && beforeId !== undefined) {
              ids.add(String(beforeId));
            }
            if (afterId !== null && afterId !== undefined) {
              ids.add(String(afterId));
            }
          }
        }
      }

      if (ids.size > 0) {
        try {
          const targetRepo = db.getRepository(assoc.targetCollection);
          const records = await targetRepo.find({
            filter: {
              id: { $in: Array.from(ids).map((id) => (isNaN(Number(id)) ? id : Number(id))) },
            },
          });

          const valueMap: Record<string, string> = {};
          for (const record of records) {
            const id = String(record.get('id'));
            const displayValue =
              record.get('name') ||
              record.get('title') ||
              record.get('label') ||
              record.get('nickname') ||
              id;
            valueMap[id] = String(displayValue);
          }

          // Map both the field name and foreign key to the same values
          relatedValues[assoc.name] = valueMap;
          relatedValues[assoc.foreignKey] = valueMap;
        } catch (err) {
          // Silently ignore errors fetching related records
          console.warn(`Failed to fetch related records for ${assoc.targetCollection}:`, err);
        }
      }
    }
  } catch (err) {
    // Silently ignore errors and return empty metadata
    console.warn(`Failed to resolve field metadata for ${collectionName}:`, err);
  }

  return { fieldLabels, relatedValues };
}

/**
 * GET /api/cdc:getFilterOptions
 * Query params:
 *   - collection: Collection name (required)
 * Returns the capturedRecords and capturedFields for the specified collection
 */
export async function getFilterOptions(ctx: Context, next: Next) {
  const { collection } = ctx.action.params;

  if (!collection) {
    ctx.throw(400, 'collection parameter is required');
  }

  const configRepo = ctx.db.getRepository('cdc_config');
  const config = await configRepo.findOne({
    filter: { collectionName: collection },
  });

  if (!config) {
    ctx.body = {
      capturedRecords: [],
      capturedFields: [],
    };
  } else {
    ctx.body = {
      capturedRecords: config.get('capturedRecords') || [],
      capturedFields: config.get('capturedFields') || [],
    };
  }

  await next();
}
