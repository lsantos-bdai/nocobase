/**
 * Inner Page Generator
 *
 * Generates ChildPageModel and ChildPageTabModel flowModels for inner pages
 * (view/edit popups with tabs and nested blocks).
 *
 * CRITICAL: All flowModels MUST include parentId, subKey, subType from the start.
 * This ensures the closure table (flowModelTreePath) is populated correctly.
 */
import type { FlowModel, InnerPageConfig, TabConfig, BlockConfig } from '../types';
import { generateUid } from './uid';

export interface GeneratedInnerPage {
  uid: string;
  flowModel: Partial<FlowModel>;
  tabs: GeneratedTab[];
}

export interface GeneratedTab {
  uid: string;
  flowModel: Partial<FlowModel>;
  gridUid: string;
  gridFlowModel: Partial<FlowModel>;
  blocks: GeneratedInnerBlock[];
}

export interface GeneratedInnerBlock {
  uid: string;
  flowModel: Partial<FlowModel>;
  children: any[]; // columns, items, actions, etc.
}

/**
 * Generate a ChildPageModel for an action's inner page
 *
 * @param config - Inner page configuration
 * @param actionUid - UID of parent action (ViewActionModel, EditActionModel, etc.)
 */
export function generateInnerPage(
  config: InnerPageConfig,
  actionUid: string
): GeneratedInnerPage {
  const uid = generateUid();

  const flowModel: Partial<FlowModel> = {
    uid,
    use: 'ChildPageModel',
    parentId: actionUid,
    subKey: 'page',
    subType: 'object',
    sortIndex: 0,
    stepParams: {
      pageSettings: {
        general: {
          displayTitle: config.displayTitle ?? false,
          enableTabs: config.enableTabs ?? true,
        },
      },
    },
    flowRegistry: {},
  };

  // Generate tabs
  const tabs: GeneratedTab[] = (config.tabs || []).map((tabConfig, index) =>
    generateTab(tabConfig, uid, index)
  );

  return { uid, flowModel, tabs };
}

/**
 * Generate a ChildPageTabModel
 *
 * @param config - Tab configuration
 * @param pageUid - UID of parent ChildPageModel
 * @param sortIndex - Position among tabs
 */
export function generateTab(
  config: TabConfig,
  pageUid: string,
  sortIndex: number
): GeneratedTab {
  const uid = generateUid();
  const gridUid = generateUid();

  const flowModel: Partial<FlowModel> = {
    uid,
    use: 'ChildPageTabModel',
    parentId: pageUid,
    subKey: 'tabs',
    subType: 'array',
    sortIndex,
    stepParams: {
      pageTabSettings: {
        tab: {
          title: config.title,
          icon: config.icon,
        },
      },
    },
    flowRegistry: {},
  };

  // Generate grid for the tab
  const gridFlowModel: Partial<FlowModel> = {
    uid: gridUid,
    use: 'BlockGridModel',
    parentId: uid,
    subKey: 'grid',
    subType: 'object',
    sortIndex: 0,
    stepParams: {
      gridSettings: {
        grid: generateGridLayout(config.blocks || []),
      },
    },
    flowRegistry: {},
  };

  // Generate blocks
  const blocks: GeneratedInnerBlock[] = (config.blocks || []).map((blockConfig, index) =>
    generateInnerBlock(blockConfig, gridUid, index)
  );

  return { uid, flowModel, gridUid, gridFlowModel, blocks };
}

/**
 * Generate grid layout for blocks
 */
function generateGridLayout(blocks: BlockConfig[]): any {
  if (blocks.length === 0) {
    return { rows: {}, sizes: {}, rowOrder: [] };
  }

  // Create a single row with all blocks stacked vertically
  const rowId = generateUid();
  const blockUids = blocks.map(() => generateUid());

  return {
    rows: {
      [rowId]: blockUids.map((uid) => [uid]),
    },
    sizes: {
      [rowId]: [24], // Full width
    },
    rowOrder: [rowId],
  };
}

/**
 * Generate a block for an inner page
 *
 * @param config - Block configuration
 * @param gridUid - UID of parent BlockGridModel
 * @param sortIndex - Position among blocks
 */
export function generateInnerBlock(
  config: BlockConfig,
  gridUid: string,
  sortIndex: number
): GeneratedInnerBlock {
  const uid = generateUid();

  // Create base flowModel based on block type
  const flowModel = createBlockFlowModel(config, uid, gridUid, sortIndex);

  // Generate children based on block type
  const children = createBlockChildren(config, uid);

  return { uid, flowModel, children };
}

/**
 * Create flowModel for a block based on its type
 */
function createBlockFlowModel(
  config: BlockConfig,
  uid: string,
  parentId: string,
  sortIndex: number
): Partial<FlowModel> {
  const baseFlowModel: Partial<FlowModel> = {
    uid,
    use: config.type,
    parentId,
    subKey: 'items',
    subType: 'array',
    sortIndex,
    flowRegistry: {},
  };

  // Add type-specific stepParams
  switch (config.type) {
    case 'TableBlockModel':
    case 'DetailsBlockModel':
    case 'FormBlockModel':
      baseFlowModel.stepParams = {
        resourceSettings: {
          init: {
            dataSourceKey: 'main',
            collectionName: config.collection,
          },
        },
      };
      break;
    case 'ChartBlockModel':
      baseFlowModel.stepParams = createChartStepParams(config as any);
      break;
    default:
      baseFlowModel.stepParams = {};
  }

  return baseFlowModel;
}

/**
 * Create chart-specific stepParams
 */
function createChartStepParams(config: any): any {
  return {
    chartSettings: {
      configure: {
        query: {
          collectionPath: ['main', config.collection],
          dimensions: [{ field: [config.chart?.dimension] }],
          measures: [
            {
              field: [config.chart?.measure?.field],
              aggregation: config.chart?.measure?.aggregation || 'count',
            },
          ],
        },
        chart: {
          option: {
            builder: {
              type: config.chart?.type || 'bar',
              legend: config.chart?.options?.legend,
              tooltip: config.chart?.options?.tooltip,
            },
          },
        },
      },
    },
  };
}

/**
 * Create children (columns, items, actions) for a block
 */
function createBlockChildren(config: BlockConfig, blockUid: string): any[] {
  const children: any[] = [];

  switch (config.type) {
    case 'TableBlockModel':
      // Columns
      const tableConfig = config as any;
      (tableConfig.columns || []).forEach((col: any, index: number) => {
        children.push(createTableColumn(col, tableConfig.collection, blockUid, index));
      });
      // Actions
      (tableConfig.toolbarActions || tableConfig.actions || []).forEach((action: any, index: number) => {
        children.push(createAction(action, blockUid, index));
      });
      break;

    case 'DetailsBlockModel':
      const detailsConfig = config as any;
      (detailsConfig.fields || []).forEach((field: any, index: number) => {
        children.push(createDetailsItem(field, detailsConfig.collection, blockUid, index));
      });
      (detailsConfig.actions || []).forEach((action: any, index: number) => {
        children.push(createAction(action, blockUid, index));
      });
      break;

    case 'FormBlockModel':
      const formConfig = config as any;
      (formConfig.fields || []).forEach((field: any, index: number) => {
        children.push(createFormItem(field, formConfig.collection, blockUid, index));
      });
      if (formConfig.submitAction) {
        children.push(createSubmitAction(formConfig.submitAction, blockUid));
      }
      break;
  }

  return children;
}

/**
 * Create a table column flowModel
 */
function createTableColumn(
  config: any,
  collectionName: string,
  tableUid: string,
  sortIndex: number
): Partial<FlowModel> {
  const uid = generateUid();
  const fieldUid = generateUid();

  const displayModel = mapDisplayTypeToModel(config.displayType || config.fieldType);

  return {
    uid,
    use: 'TableColumnModel',
    parentId: tableUid,
    subKey: 'columns',
    subType: 'array',
    sortIndex,
    stepParams: {
      fieldSettings: {
        init: {
          dataSourceKey: 'main',
          collectionName,
          fieldPath: config.field,
        },
      },
      tableColumnSettings: {
        model: { use: displayModel },
        ...(config.sortable !== undefined && { sorter: { sorter: config.sortable } }),
        ...(config.width && { width: { width: config.width } }),
        ...(config.fixed && { fixed: { fixed: config.fixed } }),
      },
    },
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
}

/**
 * Create a details item flowModel
 */
function createDetailsItem(
  config: any,
  collectionName: string,
  detailsUid: string,
  sortIndex: number
): Partial<FlowModel> {
  const uid = generateUid();

  return {
    uid,
    use: 'DetailsItemModel',
    parentId: detailsUid,
    subKey: 'items',
    subType: 'array',
    sortIndex,
    stepParams: {
      fieldSettings: {
        init: {
          dataSourceKey: 'main',
          collectionName,
          fieldPath: config.field,
        },
      },
      ...(config.span && {
        layoutSettings: { init: { span: config.span } },
      }),
    },
    flowRegistry: {},
  };
}

/**
 * Create a form item flowModel
 */
function createFormItem(
  config: any,
  collectionName: string,
  formUid: string,
  sortIndex: number
): Partial<FlowModel> {
  const uid = generateUid();

  return {
    uid,
    use: 'FormItemModel',
    parentId: formUid,
    subKey: 'items',
    subType: 'array',
    sortIndex,
    stepParams: {
      fieldSettings: {
        init: {
          dataSourceKey: 'main',
          collectionName,
          fieldPath: config.field,
        },
      },
      formItemSettings: {
        init: {
          ...(config.required !== undefined && { required: config.required }),
          ...(config.placeholder && { placeholder: config.placeholder }),
        },
      },
    },
    flowRegistry: {},
  };
}

/**
 * Create an action flowModel
 */
function createAction(config: any, parentUid: string, sortIndex: number): Partial<FlowModel> {
  const uid = generateUid();

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

  return {
    uid,
    use: modelType,
    parentId: parentUid,
    subKey: 'actions',
    subType: 'array',
    sortIndex,
    stepParams: {
      actionSettings: {
        init: {
          ...(config.confirmText && { confirmText: config.confirmText }),
        },
      },
    },
    flowRegistry: {},
  };
}

/**
 * Create a submit action flowModel
 */
function createSubmitAction(config: any, formUid: string): Partial<FlowModel> {
  const uid = generateUid();

  return {
    uid,
    use: 'SubmitActionModel',
    parentId: formUid,
    subKey: 'actions',
    subType: 'array',
    sortIndex: 0,
    stepParams: {
      actionSettings: {
        init: {
          type: 'submit',
          ...(config.label && { label: config.label }),
          ...(config.successMessage && { successMessage: config.successMessage }),
        },
      },
    },
    flowRegistry: {},
  };
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
