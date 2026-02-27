/**
 * Table Generator
 *
 * Generates TableBlockModel flowModels with columns and actions.
 *
 * CRITICAL: All flowModels MUST include parentId, subKey, subType from the start.
 * This ensures the closure table (flowModelTreePath) is populated correctly.
 * See: nocobase-ui-manipulation.md lines 111-134
 */
import type { Database } from '@nocobase/database';
import type { TableBlockConfig, FlowModel } from '../types';
import { generateUid } from './uid';

export interface GeneratedTable {
  uid: string;
  flowModel: Partial<FlowModel>;
  columns: GeneratedTableColumn[];
  actions: GeneratedTableAction[];
}

export interface GeneratedTableColumn {
  uid: string;
  flowModel: Partial<FlowModel>;
}

export interface GeneratedTableAction {
  uid: string;
  flowModel: Partial<FlowModel>;
}

/**
 * Generate a TableBlockModel from configuration
 *
 * @param config - Table block configuration
 * @param collectionName - Resolved collection name (internal t_xxx format)
 * @param parentId - UID of parent flowModel (BlockGridModel)
 * @param sortIndex - Position among siblings
 */
export function generateTable(
  config: TableBlockConfig,
  collectionName: string,
  parentId: string,
  sortIndex: number
): GeneratedTable {
  const uid = generateUid();

  // Generate table block with parent relationship from the start
  const flowModel: Partial<FlowModel> = {
    uid,
    use: 'TableBlockModel',
    parentId,
    subKey: 'items',
    subType: 'array',
    sortIndex,
    stepParams: {
      resourceSettings: {
        init: {
          dataSourceKey: 'main',
          collectionName,
        },
      },
      tableSettings: {
        init: {
          pageSize: config.pageSize || 20,
        },
      },
    },
    flowRegistry: {},
  };

  // Add default sort if specified
  if (config.defaultSort) {
    (flowModel.stepParams as any).tableSettings.init.defaultSort = [
      { field: config.defaultSort.field, order: config.defaultSort.order },
    ];
  }

  // Generate columns with table as parent
  const columns: GeneratedTableColumn[] = config.columns.map((col, index) =>
    generateTableColumn(col, collectionName, uid, index)
  );

  // Generate actions with table as parent
  const actions: GeneratedTableAction[] = (config.actions || []).map((action, index) =>
    generateTableAction(action, uid, index)
  );

  return { uid, flowModel, columns, actions };
}

/**
 * Generate a TableColumnModel with nested field subModel
 *
 * CRITICAL: Each column needs a nested `subModels.field` with the display model.
 * Without this, the column won't render data properly.
 *
 * @param config - Column configuration
 * @param collectionName - Resolved collection name
 * @param tableUid - UID of parent table
 * @param sortIndex - Position among columns
 */
function generateTableColumn(
  config: { field: string; title?: string; width?: number; sortable?: boolean; fixed?: 'left' | 'right'; fieldType?: string },
  collectionName: string,
  tableUid: string,
  sortIndex: number
): GeneratedTableColumn {
  const uid = generateUid();
  const fieldUid = generateUid();

  // Determine display model based on field type
  // Default to DisplayTextFieldModel, use DisplayCheckboxFieldModel for boolean fields
  const displayModel = config.fieldType === 'checkbox' || config.fieldType === 'boolean'
    ? 'DisplayCheckboxFieldModel'
    : 'DisplayTextFieldModel';

  const stepParams: Record<string, unknown> = {
    fieldSettings: {
      init: {
        dataSourceKey: 'main',
        collectionName,
        fieldPath: config.field,
      },
    },
    tableColumnSettings: {
      model: {
        use: displayModel,
      },
    },
  };

  // Add optional settings
  if (config.width) {
    (stepParams as any).tableColumnSettings.width = config.width;
  }
  if (config.sortable !== undefined) {
    (stepParams as any).tableColumnSettings.sortable = config.sortable;
  }
  if (config.fixed) {
    (stepParams as any).tableColumnSettings.fixed = config.fixed;
  }

  // Include parent relationship and nested subModels from the start
  // The nested field subModel is CRITICAL for the column to render data
  const flowModel: Partial<FlowModel> = {
    uid,
    use: 'TableColumnModel',
    parentId: tableUid,
    subKey: 'columns',
    subType: 'array',
    sortIndex,
    stepParams,
    subModels: {
      field: {
        uid: fieldUid,
        use: displayModel,
        props: null,
        parentId: uid,
        subKey: 'field',
        subType: 'object',
        stepParams: {},
        sortIndex: 0,
        flowRegistry: {},
      },
    },
    flowRegistry: {},
  };

  return { uid, flowModel };
}

/**
 * Generate a table action (filter, view, edit, etc.)
 *
 * @param config - Action configuration
 * @param tableUid - UID of parent table
 * @param sortIndex - Position among actions
 */
function generateTableAction(
  config: { type: string; position?: string; confirmText?: string },
  tableUid: string,
  sortIndex: number
): GeneratedTableAction {
  const uid = generateUid();

  // Map action type to model type
  const actionModelMap: Record<string, string> = {
    filter: 'FilterActionModel',
    view: 'ViewActionModel',
    edit: 'EditActionModel',
    delete: 'DeleteActionModel',
    create: 'CreateActionModel',
    refresh: 'RefreshActionModel',
    export: 'ExportActionModel',
  };

  const modelType = actionModelMap[config.type] || 'ActionModel';

  const stepParams: Record<string, unknown> = {
    actionSettings: {
      init: {},
    },
  };

  // Add confirmation text for delete actions
  if (config.type === 'delete' && config.confirmText) {
    (stepParams.actionSettings as any).init.confirmText = config.confirmText;
  }

  // Include parent relationship from the start
  const flowModel: Partial<FlowModel> = {
    uid,
    use: modelType,
    parentId: tableUid,
    subKey: 'actions',
    subType: 'array',
    sortIndex,
    stepParams,
    flowRegistry: {},
  };

  return { uid, flowModel };
}

/**
 * Save a TableBlockModel and its children to the database
 *
 * Uses FlowModelRepository.upsertModel() which correctly handles:
 * - The 'options' JSON column structure
 * - Tree path (closure table) creation for parent-child relationships
 */
export async function saveTable(db: Database, table: GeneratedTable): Promise<void> {
  const repo = db.getRepository('flowModels') as any;

  // Save the table block itself using upsertModel
  await repo.upsertModel(table.flowModel);

  // Save columns using upsertModel
  for (const column of table.columns) {
    await repo.upsertModel(column.flowModel);
  }

  // Save actions using upsertModel
  for (const action of table.actions) {
    await repo.upsertModel(action.flowModel);
  }
}
