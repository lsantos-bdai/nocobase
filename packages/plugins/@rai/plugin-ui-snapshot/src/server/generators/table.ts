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
import type { TableBlockConfig, TableColumnConfig, RowActionConfig, FlowModel } from '../types';
import { generateUid } from './uid';
import { generateInnerPage } from './inner-page';

export interface GeneratedTable {
  uid: string;
  flowModel: Partial<FlowModel>;
  columns: GeneratedTableColumn[];
  actions: GeneratedTableAction[];
  actionsColumn?: GeneratedActionsColumn;
}

export interface GeneratedTableColumn {
  uid: string;
  flowModel: Partial<FlowModel>;
}

export interface GeneratedTableAction {
  uid: string;
  flowModel: Partial<FlowModel>;
}

export interface GeneratedActionsColumn {
  uid: string;
  flowModel: Partial<FlowModel>;
  rowActions: GeneratedRowAction[];
}

export interface GeneratedRowAction {
  uid: string;
  flowModel: Partial<FlowModel>;
  innerPage?: any; // GeneratedInnerPage
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
        // Add quickEdit setting if specified
        ...(config.quickEdit !== undefined && {
          quickEdit: { editable: config.quickEdit },
        }),
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

  // Generate toolbar actions with table as parent
  // Support both new toolbarActions and legacy actions field
  const toolbarActions = config.toolbarActions || config.actions || [];
  const actions: GeneratedTableAction[] = toolbarActions.map((action, index) =>
    generateTableAction(action, uid, index)
  );

  // Generate TableActionsColumnModel with row actions if specified
  let actionsColumn: GeneratedActionsColumn | undefined;
  if (config.rowActions && config.rowActions.length > 0) {
    actionsColumn = generateActionsColumn(config.rowActions, collectionName, uid, columns.length);
  }

  return { uid, flowModel, columns, actions, actionsColumn };
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
  config: TableColumnConfig,
  collectionName: string,
  tableUid: string,
  sortIndex: number
): GeneratedTableColumn {
  const uid = generateUid();
  const fieldUid = generateUid();

  // Determine display model based on displayType or legacy fieldType
  const displayModel = mapDisplayTypeToModel(config.displayType || config.fieldType);

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

  // Add optional settings with correct structure
  // Fix: width should be at tableColumnSettings.width.width
  if (config.width) {
    (stepParams as any).tableColumnSettings.width = { width: config.width };
  }
  // Fix: sortable should be at tableColumnSettings.sorter.sorter
  if (config.sortable !== undefined) {
    (stepParams as any).tableColumnSettings.sorter = { sorter: config.sortable };
  }
  // Fix: fixed should be at tableColumnSettings.fixed.fixed
  if (config.fixed) {
    (stepParams as any).tableColumnSettings.fixed = { fixed: config.fixed };
  }

  // Include parent relationship and nested subModels from the start
  // The nested field subModel is CRITICAL for the column to render data
  const flowModel: Partial<FlowModel> = {
    uid,
    use: 'TableColumnModel',
    parentId: tableUid,
    subKey: 'columns',
    subType: 'array',
    sortIndex: config.sortIndex ?? sortIndex,
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
 * Map displayType to NocoBase display model
 */
function mapDisplayTypeToModel(displayType: string | undefined): string {
  if (!displayType) return 'DisplayTextFieldModel';

  const map: Record<string, string> = {
    text: 'DisplayTextFieldModel',
    checkbox: 'DisplayCheckboxFieldModel',
    boolean: 'DisplayCheckboxFieldModel',
    date: 'DisplayDateFieldModel',
    number: 'DisplayNumberFieldModel',
    select: 'DisplaySelectFieldModel',
    tag: 'DisplayTagFieldModel',
    link: 'DisplayLinkFieldModel',
    image: 'DisplayImageFieldModel',
  };

  return map[displayType] || 'DisplayTextFieldModel';
}

/**
 * Generate a TableActionsColumnModel with row actions
 *
 * @param rowActions - Row action configurations
 * @param collectionName - Resolved collection name
 * @param tableUid - UID of parent table
 * @param sortIndex - Position among columns (usually last)
 */
function generateActionsColumn(
  rowActions: RowActionConfig[],
  collectionName: string,
  tableUid: string,
  sortIndex: number
): GeneratedActionsColumn {
  const uid = generateUid();

  const flowModel: Partial<FlowModel> = {
    uid,
    use: 'TableActionsColumnModel',
    parentId: tableUid,
    subKey: 'columns',
    subType: 'array',
    sortIndex,
    stepParams: {
      tableColumnSettings: {
        title: {
          title: 'Actions',
        },
        width: {
          width: 200,
        },
      },
    },
    flowRegistry: {},
  };

  // Generate row actions
  const generatedRowActions: GeneratedRowAction[] = rowActions.map((action, index) =>
    generateRowAction(action, collectionName, uid, index)
  );

  return { uid, flowModel, rowActions: generatedRowActions };
}

/**
 * Generate a row action (view, edit, delete with optional inner page)
 *
 * @param config - Row action configuration
 * @param collectionName - Resolved collection name
 * @param actionsColumnUid - UID of parent TableActionsColumnModel
 * @param sortIndex - Position among actions
 */
function generateRowAction(
  config: RowActionConfig,
  collectionName: string,
  actionsColumnUid: string,
  sortIndex: number
): GeneratedRowAction {
  const uid = generateUid();

  // Map action type to model type
  const actionModelMap: Record<string, string> = {
    view: 'ViewActionModel',
    edit: 'EditActionModel',
    delete: 'DeleteActionModel',
    link: 'LinkActionModel',
    popup: 'PopupActionModel',
  };

  const modelType = actionModelMap[config.type] || 'ActionModel';

  const stepParams: Record<string, unknown> = {
    buttonSettings: {
      general: {
        type: config.buttonType || 'link',
        icon: null,
      },
    },
    actionSettings: {
      init: {},
    },
  };

  // Add confirmation text for delete actions
  if (config.type === 'delete' && config.confirmText) {
    (stepParams.actionSettings as any).init.confirmText = config.confirmText;
  }

  const flowModel: Partial<FlowModel> = {
    uid,
    use: modelType,
    parentId: actionsColumnUid,
    subKey: 'actions',
    subType: 'array',
    sortIndex,
    stepParams,
    flowRegistry: {},
  };

  // Generate inner page if specified
  let innerPage: any;
  if (config.innerPage) {
    innerPage = generateInnerPage(config.innerPage, uid);
    // Add subModels reference to the action
    (flowModel as any).subModels = {
      page: innerPage.flowModel,
    };
  }

  return { uid, flowModel, innerPage };
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

  // Save toolbar actions using upsertModel
  for (const action of table.actions) {
    await repo.upsertModel(action.flowModel);
  }

  // Save actions column with row actions if present
  if (table.actionsColumn) {
    await repo.upsertModel(table.actionsColumn.flowModel);

    // Save each row action
    for (const rowAction of table.actionsColumn.rowActions) {
      await repo.upsertModel(rowAction.flowModel);

      // Save inner page and its children if present
      if (rowAction.innerPage) {
        await saveInnerPage(repo, rowAction.innerPage);
      }
    }
  }
}

/**
 * Save an inner page and all its children
 */
async function saveInnerPage(repo: any, innerPage: any): Promise<void> {
  // Save the ChildPageModel
  await repo.upsertModel(innerPage.flowModel);

  // Save each tab
  for (const tab of innerPage.tabs) {
    await repo.upsertModel(tab.flowModel);
    await repo.upsertModel(tab.gridFlowModel);

    // Save each block in the tab
    for (const block of tab.blocks) {
      await repo.upsertModel(block.flowModel);

      // Save block children (columns, items, actions)
      for (const child of block.children) {
        await repo.upsertModel(child);
      }
    }
  }
}
