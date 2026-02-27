/**
 * BlockGrid Generator
 *
 * Generates BlockGridModel flowModels with proper grid layout structure.
 *
 * CRITICAL: All flowModels MUST include parentId, subKey, subType from the start.
 * This ensures the closure table (flowModelTreePath) is populated correctly.
 * See: nocobase-ui-manipulation.md lines 111-134
 */
import type { Database } from '@nocobase/database';
import type { LayoutConfig, GridSettings, FlowModel } from '../types';
import { generateUid, generateRowId } from './uid';
import { extractBlockName } from '../services/config-parser';

export interface BlockGridGeneratorOptions {
  layout: LayoutConfig;
  blockUids: Record<string, string>; // blockName → uid mapping
}

export interface GeneratedBlockGrid {
  uid: string;
  flowModel: Partial<FlowModel>;
}

/**
 * Generate a BlockGridModel from layout configuration
 *
 * @param options - Grid generation options (layout, blockUids)
 * @param parentId - UID of parent flowModel (RootPageModel)
 * @param sortIndex - Position among siblings (usually 0)
 */
export function generateBlockGrid(
  options: BlockGridGeneratorOptions,
  parentId: string,
  sortIndex: number
): GeneratedBlockGrid {
  const uid = generateUid();
  const { layout, blockUids } = options;

  // Build grid structure
  const rows: Record<string, string[][]> = {};
  const sizes: Record<string, number[]> = {};
  const rowOrder: string[] = [];

  for (const row of layout.rows) {
    const rowId = generateRowId();
    rowOrder.push(rowId);

    const columns: string[][] = [];
    const columnSizes: number[] = [];

    for (const col of row.columns) {
      columnSizes.push(col.width);

      // Each column contains an array of block UIDs (stacked vertically)
      const blockUidsInColumn: string[] = [];
      for (const blockRef of col.blocks) {
        const blockName = extractBlockName(blockRef.$ref);
        const blockUid = blockUids[blockName];
        if (blockUid) {
          blockUidsInColumn.push(blockUid);
        }
      }
      columns.push(blockUidsInColumn);
    }

    rows[rowId] = columns;
    sizes[rowId] = columnSizes;
  }

  const gridSettings: GridSettings = {
    grid: {
      rows,
      sizes,
      rowOrder,
    },
  };

  // Include parent relationship from the start
  const flowModel: Partial<FlowModel> = {
    uid,
    use: 'BlockGridModel',
    parentId,
    subKey: 'grid',
    subType: 'object',
    sortIndex,
    stepParams: {
      gridSettings,
    },
    flowRegistry: {},
  };

  return { uid, flowModel };
}

/**
 * Save a BlockGridModel to the database
 *
 * Uses FlowModelRepository.upsertModel() which correctly handles:
 * - The 'options' JSON column structure
 * - Tree path (closure table) creation for parent-child relationships
 */
export async function saveBlockGrid(db: Database, blockGrid: GeneratedBlockGrid): Promise<void> {
  const repo = db.getRepository('flowModels') as any;

  await repo.upsertModel(blockGrid.flowModel);
}

/**
 * Update an existing BlockGridModel's grid settings
 */
export async function updateBlockGridLayout(
  db: Database,
  gridUid: string,
  gridSettings: GridSettings
): Promise<void> {
  const repo = db.getRepository('flowModels');

  await repo.update({
    filter: { uid: gridUid },
    values: {
      stepParams: { gridSettings },
    },
  });
}
