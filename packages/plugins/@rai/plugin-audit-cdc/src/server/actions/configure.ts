import { Context, Next } from '@nocobase/actions';
import { Op } from '@nocobase/database';
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
 *   - collection: Collection name (required)
 *   - page: Page number (default: 1)
 *   - pageSize: Number of items per page (default: 20)
 *   - operation: Filter by operation type ('create' | 'update' | 'destroy')
 *   - startDate: Filter snapshots created after this date (ISO string)
 *   - endDate: Filter snapshots created before this date (ISO string)
 *   - groupByRecord: If true, returns snapshots grouped by recordId (default: false)
 */
export async function listSnapshots(ctx: Context, next: Next) {
  const {
    collection,
    page = 1,
    pageSize = 20,
    operation,
    startDate,
    endDate,
    groupByRecord = false,
  } = ctx.action.params;

  if (!collection) {
    ctx.throw(400, 'collection parameter is required');
  }

  const snapshotRepo = ctx.db.getRepository('cdc_snapshots');

  // Build filter
  const filter: Record<string, unknown> = {
    collectionName: collection,
  };

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

  // Get total count
  const totalCount = await snapshotRepo.count({ filter });

  if (groupByRecord === 'true' || groupByRecord === true) {
    // Group by recordId - get unique records with their latest snapshot
    const snapshots = await snapshotRepo.find({
      filter,
      sort: ['-createdAt'],
    });

    // Group by recordId
    const recordMap = new Map<
      string,
      {
        recordId: string;
        recordName: string;
        snapshotCount: number;
        latestOperation: string;
        latestTimestamp: Date;
        snapshots: Array<Record<string, unknown>>;
      }
    >();

    for (const snapshot of snapshots) {
      const recordId = snapshot.get('recordId') as string;
      const data = (snapshot.get('afterData') || snapshot.get('beforeData')) as Record<string, unknown>;
      const recordName = getRecordName(data);

      if (!recordMap.has(recordId)) {
        recordMap.set(recordId, {
          recordId,
          recordName,
          snapshotCount: 0,
          latestOperation: snapshot.get('operation') as string,
          latestTimestamp: snapshot.get('createdAt') as Date,
          snapshots: [],
        });
      }

      const record = recordMap.get(recordId)!;
      record.snapshotCount++;
      record.snapshots.push({
        id: snapshot.get('id'),
        operation: snapshot.get('operation'),
        changedFields: snapshot.get('changedFields'),
        userId: snapshot.get('userId'),
        createdAt: snapshot.get('createdAt'),
        version: snapshot.get('version'),
      });
    }

    // Convert to array and paginate
    const records = Array.from(recordMap.values());
    const paginatedRecords = records.slice((page - 1) * pageSize, page * pageSize);

    ctx.withoutDataWrapping = true;
    ctx.body = {
      data: paginatedRecords,
      meta: {
        total: records.length,
        page: Number(page),
        pageSize: Number(pageSize),
        totalPages: Math.ceil(records.length / pageSize),
      },
    };
  } else {
    // Flat chronological list
    const snapshots = await snapshotRepo.find({
      filter,
      sort: ['-createdAt'],
      limit: Number(pageSize),
      offset: (Number(page) - 1) * Number(pageSize),
      appends: ['user'],
    });

    const data = snapshots.map((snapshot) => {
      const afterData = snapshot.get('afterData') as Record<string, unknown> | null;
      const beforeData = snapshot.get('beforeData') as Record<string, unknown> | null;
      const user = snapshot.get('user') as Record<string, unknown> | null;

      return {
        id: snapshot.get('id'),
        recordId: snapshot.get('recordId'),
        recordName: getRecordName(afterData || beforeData),
        operation: snapshot.get('operation'),
        beforeData,
        afterData,
        changedFields: snapshot.get('changedFields'),
        userId: snapshot.get('userId'),
        userName: user ? (user.nickname || user.username || user.email || `User ${user.id}`) : null,
        createdAt: snapshot.get('createdAt'),
        version: snapshot.get('version'),
      };
    });

    ctx.withoutDataWrapping = true;
    ctx.body = {
      data,
      meta: {
        total: totalCount,
        page: Number(page),
        pageSize: Number(pageSize),
        totalPages: Math.ceil(totalCount / pageSize),
      },
    };
  }

  await next();
}

function getRecordName(data: Record<string, unknown> | null): string {
  if (!data) return 'Unknown';
  return String(data.name || data.title || data.label || data.nickname || data.id || 'Unknown');
}
