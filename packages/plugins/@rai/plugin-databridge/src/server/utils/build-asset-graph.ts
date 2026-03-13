import { Collection, Database } from '@nocobase/database';

/**
 * A lightweight reference to a single asset in the graph.
 * No full data — just enough to identify and fetch later.
 */
export interface AssetRef {
  collection: string;
  id: number | string;
}

/**
 * Result of building the asset graph.
 */
export interface AssetGraph {
  /** Ordered list: primaries first, then BFS layers */
  refs: AssetRef[];
  /** Total primary matches (for display; graph may contain fewer if max_assets hit) */
  primaryCount: number;
  /** Whether BFS was stopped early because the graph reached max_assets */
  truncated: boolean;
}

/**
 * Deduplication key for a (collection, id) pair.
 */
export function dedupeKey(collection: string, id: number | string): string {
  return `${collection}::${id}`;
}

interface BfsItem {
  collection: string;
  id: number | string;
  depth: number;
}

/**
 * Get all relation field metadata for a collection, grouped by how to
 * discover related IDs cheaply.
 */
function getRelationMeta(coll: Collection) {
  const belongsTo: { fieldName: string; foreignKey: string; target: string }[] = [];
  const hasOneOrMany: { fieldName: string; target: string }[] = [];
  const belongsToMany: { fieldName: string; target: string }[] = [];

  for (const field of coll.getFields()) {
    if (!field.isRelationField()) continue;
    const target = field.options?.target;
    if (!target) continue;

    switch (field.type) {
      case 'belongsTo': {
        const fk = field.options?.foreignKey;
        if (fk) {
          belongsTo.push({ fieldName: field.name, foreignKey: fk, target });
        }
        break;
      }
      case 'hasOne':
      case 'hasMany': {
        hasOneOrMany.push({ fieldName: field.name, target });
        break;
      }
      case 'belongsToMany': {
        belongsToMany.push({ fieldName: field.name, target });
        break;
      }
    }
  }

  return { belongsTo, hasOneOrMany, belongsToMany };
}

/**
 * Extract related IDs from a set of source records using lightweight queries.
 *
 * For belongsTo: reads FK column directly from the source rows (no extra query).
 * For hasOne/hasMany: queries target table with fields: ['id'].
 * For belongsToMany: queries through the Sequelize association to get target IDs.
 *
 * Returns an array of { collection, id } for all discovered relations.
 */
async function discoverRelatedIds(
  db: Database,
  coll: Collection,
  sourceRows: Record<string, unknown>[],
): Promise<{ collection: string; id: number | string }[]> {
  const related: { collection: string; id: number | string }[] = [];
  const { belongsTo, hasOneOrMany, belongsToMany } = getRelationMeta(coll);

  // belongsTo: FK is on the source row — just read the column value
  for (const rel of belongsTo) {
    for (const row of sourceRows) {
      const fkValue = row[rel.foreignKey];
      if (fkValue != null) {
        related.push({ collection: rel.target, id: fkValue as number | string });
      }
    }
  }

  // hasOne/hasMany: query target table for rows pointing back at source IDs
  const sourceIds = sourceRows
    .map((r) => r.id)
    .filter((id) => id != null) as (number | string)[];

  if (sourceIds.length > 0) {
    for (const rel of hasOneOrMany) {
      const assoc = coll.model.associations[rel.fieldName];
      if (!assoc) continue;

      const foreignKey = (assoc as any).foreignKey;
      if (!foreignKey) continue;

      const targetRepo = db.getRepository(rel.target);
      if (!targetRepo) continue;

      const targetRows = await targetRepo.find({
        fields: ['id'],
        filter: { [foreignKey]: { $in: sourceIds } },
      } as any);

      for (const row of targetRows) {
        const id = (row as any).id ?? (row as any).get?.('id');
        if (id != null) {
          related.push({ collection: rel.target, id });
        }
      }
    }

    // belongsToMany: query through the Sequelize association for target IDs
    for (const rel of belongsToMany) {
      const assoc = coll.model.associations[rel.fieldName] as any;
      if (!assoc || !assoc.through?.model) continue;

      const throughModel = assoc.through.model;
      const foreignKey = assoc.foreignKey;
      const otherKey = assoc.otherKey;
      if (!foreignKey || !otherKey) continue;

      const junctionRows = await throughModel.findAll({
        attributes: [otherKey],
        where: { [foreignKey]: sourceIds },
        raw: true,
      });

      for (const row of junctionRows) {
        const targetId = (row as any)[otherKey];
        if (targetId != null) {
          related.push({ collection: rel.target, id: targetId });
        }
      }
    }
  }

  return related;
}

/**
 * BFS-expand relations from seed items already in the graph.
 *
 * Shared by buildAssetGraph (single-collection primaries) and
 * buildAssetGraphFromRefs (pre-resolved multi-collection primaries).
 *
 * Mutates `visited` and `refs` in place. Returns true if truncated.
 */
async function bfsExpand(
  db: Database,
  seedsByCollection: Map<string, Record<string, unknown>[]>,
  visited: Set<string>,
  refs: AssetRef[],
  maxAssets: number,
  relationDepth: number,
): Promise<boolean> {
  // Seed BFS queue from all primary collections' relations
  const bfsQueue: BfsItem[] = [];

  for (const [collectionName, rows] of seedsByCollection) {
    const coll = db.getCollection(collectionName);
    if (!coll) continue;

    const related = await discoverRelatedIds(db, coll, rows);
    for (const rel of related) {
      const key = dedupeKey(rel.collection, rel.id);
      if (!visited.has(key)) {
        bfsQueue.push({ collection: rel.collection, id: rel.id, depth: 1 });
      }
    }
  }

  // Process BFS queue level by level
  while (bfsQueue.length > 0) {
    const currentDepth = bfsQueue[0].depth;

    // Collect items at this depth, grouped by collection
    const byCollection = new Map<string, (number | string)[]>();

    while (bfsQueue.length > 0 && bfsQueue[0].depth === currentDepth) {
      const item = bfsQueue.shift()!;
      const key = dedupeKey(item.collection, item.id);
      if (visited.has(key)) continue;
      visited.add(key);

      refs.push({ collection: item.collection, id: item.id });

      if (refs.length >= maxAssets) {
        return true;
      }

      // Track IDs for BFS expansion at next depth
      if (currentDepth < relationDepth) {
        const ids = byCollection.get(item.collection) || [];
        ids.push(item.id);
        byCollection.set(item.collection, ids);
      }
    }

    // Expand to next depth if needed
    if (currentDepth < relationDepth) {
      for (const [relCollectionName, ids] of byCollection) {
        const relColl = db.getCollection(relCollectionName);
        if (!relColl) continue;

        // Fetch lightweight rows for these IDs
        const { belongsTo: relBelongsTo } = getRelationMeta(relColl);
        const relFkFields = relBelongsTo.map((r) => r.foreignKey);
        const relLightFields = ['id', ...relFkFields];

        const relRepo = db.getRepository(relCollectionName);
        const relRows = await relRepo.find({
          fields: relLightFields,
          filter: { id: { $in: ids } },
        } as any);

        const relRowData = relRows.map((r: any) => (typeof r.toJSON === 'function' ? r.toJSON() : r));

        // Discover next-level relations
        const nextRelated = await discoverRelatedIds(db, relColl, relRowData);
        for (const rel of nextRelated) {
          const key = dedupeKey(rel.collection, rel.id);
          if (!visited.has(key)) {
            bfsQueue.push({ collection: rel.collection, id: rel.id, depth: currentDepth + 1 });
          }
        }
      }
    }
  }

  return false;
}

/**
 * Build a lightweight asset graph using BFS relation expansion.
 *
 * Phase 1 of the two-phase approach:
 * - Fetches only IDs (+ belongsTo FK columns) for the primary query
 * - BFS-expands relations using ID-only queries
 * - Stops when graph reaches maxAssets or relationDepth is exhausted
 *
 * The returned graph is ordered: primaries first (in DB sort order),
 * then BFS layers (breadth-first).
 *
 * @param db             Database instance
 * @param collectionName Collection to query
 * @param filter         Optional filter (already mapped to internal field names)
 * @param sort           Optional sort (already mapped to internal field names)
 * @param maxAssets      Maximum total graph size (primaries + relations)
 * @param relationDepth  How deep to traverse (1 = direct relations only)
 * @returns AssetGraph with ordered refs, primaryCount, and truncated flag
 */
export async function buildAssetGraph(
  db: Database,
  collectionName: string,
  filter: Record<string, unknown> | undefined,
  sort: string[] | undefined,
  maxAssets: number,
  relationDepth: number,
): Promise<AssetGraph> {
  const coll = db.getCollection(collectionName);
  if (!coll) {
    return { refs: [], primaryCount: 0, truncated: false };
  }

  // Discover belongsTo FK column names so we include them in the lightweight query
  const { belongsTo } = getRelationMeta(coll);
  const fkFields = belongsTo.map((r) => r.foreignKey);
  const lightFields = ['id', ...fkFields];

  // Fetch ALL primary IDs matching the filter (lightweight — no appends)
  const repo = db.getRepository(collectionName);
  const findOptions: Record<string, unknown> = {
    fields: lightFields,
  };
  if (filter) findOptions.filter = filter;
  if (sort) findOptions.sort = sort;

  // Get primary count + primary rows (capped at maxAssets)
  const [primaryRows, primaryCount] = await Promise.all([
    repo.find({ ...findOptions, limit: maxAssets } as any),
    repo.count({ filter: filter || {} } as any),
  ]);

  // Build the graph starting with primaries
  const visited = new Set<string>();
  const refs: AssetRef[] = [];

  // Add primaries to graph
  const primaryData: Record<string, unknown>[] = [];
  for (const row of primaryRows) {
    const rowData = typeof row.toJSON === 'function' ? row.toJSON() : row;
    const id = rowData.id;
    if (id == null) continue;

    const key = dedupeKey(collectionName, id);
    if (visited.has(key)) continue;
    visited.add(key);

    refs.push({ collection: collectionName, id });
    primaryData.push(rowData);

    if (refs.length >= maxAssets) {
      return { refs, primaryCount, truncated: true };
    }
  }

  // BFS expansion
  const seedsByCollection = new Map<string, Record<string, unknown>[]>();
  seedsByCollection.set(collectionName, primaryData);

  const truncated = await bfsExpand(db, seedsByCollection, visited, refs, maxAssets, relationDepth);

  return { refs, primaryCount, truncated };
}

/**
 * Build a lightweight asset graph from pre-resolved asset references.
 *
 * Used by platform-scoped endpoints where primaries are resolved via the
 * platform lookup table (potentially spanning multiple collections) rather
 * than a single-collection filter query.
 *
 * Phase 1 of the two-phase approach:
 * - Takes pre-resolved {collection, id} seed refs as primaries
 * - Fetches lightweight rows (ID + belongsTo FKs) for each seed to feed BFS
 * - BFS-expands relations using ID-only queries
 * - Stops when graph reaches maxAssets or relationDepth is exhausted
 *
 * @param db            Database instance
 * @param seedRefs      Pre-resolved primary asset references
 * @param maxAssets     Maximum total graph size (primaries + relations)
 * @param relationDepth How deep to traverse (1 = direct relations only)
 * @returns AssetGraph with ordered refs, primaryCount, and truncated flag
 */
export async function buildAssetGraphFromRefs(
  db: Database,
  seedRefs: AssetRef[],
  maxAssets: number,
  relationDepth: number,
): Promise<AssetGraph> {
  const primaryCount = seedRefs.length;
  const visited = new Set<string>();
  const refs: AssetRef[] = [];

  // Add seed refs as primaries (capped at maxAssets)
  for (const ref of seedRefs) {
    const key = dedupeKey(ref.collection, ref.id);
    if (visited.has(key)) continue;
    visited.add(key);

    refs.push(ref);

    if (refs.length >= maxAssets) {
      return { refs, primaryCount, truncated: true };
    }
  }

  // Group seeds by collection for lightweight row fetching
  const seedIdsByCollection = new Map<string, (number | string)[]>();
  for (const ref of refs) {
    const ids = seedIdsByCollection.get(ref.collection) || [];
    ids.push(ref.id);
    seedIdsByCollection.set(ref.collection, ids);
  }

  // Fetch lightweight rows (ID + FK columns) for BFS seeding
  const seedsByCollection = new Map<string, Record<string, unknown>[]>();
  for (const [collectionName, ids] of seedIdsByCollection) {
    const coll = db.getCollection(collectionName);
    if (!coll) continue;

    const { belongsTo } = getRelationMeta(coll);
    const fkFields = belongsTo.map((r) => r.foreignKey);
    const lightFields = ['id', ...fkFields];

    const repo = db.getRepository(collectionName);
    const rows = await repo.find({
      fields: lightFields,
      filter: { id: { $in: ids } },
    } as any);

    const rowData = rows.map((r: any) => (typeof r.toJSON === 'function' ? r.toJSON() : r));
    seedsByCollection.set(collectionName, rowData);
  }

  // BFS expansion from seeds
  const truncated = await bfsExpand(db, seedsByCollection, visited, refs, maxAssets, relationDepth);

  return { refs, primaryCount, truncated };
}

/**
 * Fetch full records for a window (slice) of the asset graph.
 *
 * Phase 2 of the two-phase approach:
 * - Groups refs by collection for batch fetching
 * - Fetches full records with relation appends
 * - Returns results in the same order as the input refs
 *
 * @param db    Database instance
 * @param refs  The window slice of AssetRef items to fully resolve
 * @returns Map from dedupeKey to the fetched raw record
 */
export async function fetchWindowRecords(
  db: Database,
  refs: AssetRef[],
): Promise<Map<string, { collection: Collection; record: Record<string, unknown> }>> {
  const result = new Map<string, { collection: Collection; record: Record<string, unknown> }>();

  if (refs.length === 0) return result;

  // Group by collection
  const byCollection = new Map<string, (number | string)[]>();
  for (const ref of refs) {
    const ids = byCollection.get(ref.collection) || [];
    ids.push(ref.id);
    byCollection.set(ref.collection, ids);
  }

  // Fetch each collection group with full appends
  for (const [collectionName, ids] of byCollection) {
    const coll = db.getCollection(collectionName);
    if (!coll) continue;

    const relationFields = coll
      .getFields()
      .filter((f) => f.isRelationField())
      .map((f) => f.name);

    const repo = db.getRepository(collectionName);
    const rows = await repo.find({
      filter: { id: { $in: ids } },
      appends: relationFields,
    } as any);

    for (const row of rows) {
      const rowData = typeof row.toJSON === 'function' ? row.toJSON() : row;
      const id = rowData.id;
      if (id == null) continue;

      const key = dedupeKey(collectionName, id);
      result.set(key, { collection: coll, record: rowData });
    }
  }

  return result;
}
