/**
 * Details Generator
 *
 * Generates DetailsBlockModel flowModels for displaying record details.
 *
 * CRITICAL: All flowModels MUST include parentId, subKey, subType from the start.
 * This ensures the closure table (flowModelTreePath) is populated correctly.
 * See: nocobase-ui-manipulation.md lines 111-134
 */
import type { Database } from '@nocobase/database';
import type { DetailsBlockConfig, FlowModel } from '../types';
import { generateUid } from './uid';

export interface GeneratedDetails {
  uid: string;
  flowModel: Partial<FlowModel>;
  items: GeneratedDetailsItem[];
  actions: GeneratedDetailsAction[];
}

export interface GeneratedDetailsItem {
  uid: string;
  flowModel: Partial<FlowModel>;
}

export interface GeneratedDetailsAction {
  uid: string;
  flowModel: Partial<FlowModel>;
}

/**
 * Generate a DetailsBlockModel from configuration
 *
 * @param config - Details block configuration
 * @param collectionName - Resolved collection name (internal t_xxx format)
 * @param parentId - UID of parent flowModel (BlockGridModel)
 * @param sortIndex - Position among siblings
 */
export function generateDetails(
  config: DetailsBlockConfig,
  collectionName: string,
  parentId: string,
  sortIndex: number
): GeneratedDetails {
  const uid = generateUid();

  // Include parent relationship from the start
  const flowModel: Partial<FlowModel> = {
    uid,
    use: 'DetailsBlockModel',
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
    },
    flowRegistry: {},
  };

  // Generate field items with details as parent
  const items: GeneratedDetailsItem[] = config.fields.map((field, index) =>
    generateDetailsItem(field, collectionName, uid, index)
  );

  // Generate actions with details as parent
  const actions: GeneratedDetailsAction[] = (config.actions || []).map((action, index) =>
    generateDetailsAction(action, uid, index)
  );

  return { uid, flowModel, items, actions };
}

/**
 * Generate a DetailsItemModel for a field
 *
 * @param config - Field configuration
 * @param collectionName - Resolved collection name
 * @param detailsUid - UID of parent details block
 * @param sortIndex - Position among items
 */
function generateDetailsItem(
  config: { field: string; title?: string; span?: number },
  collectionName: string,
  detailsUid: string,
  sortIndex: number
): GeneratedDetailsItem {
  const uid = generateUid();

  const stepParams: Record<string, unknown> = {
    fieldSettings: {
      init: {
        dataSourceKey: 'main',
        collectionName,
        fieldPath: config.field,
      },
    },
  };

  // Add span if specified
  if (config.span) {
    (stepParams as any).layoutSettings = {
      init: { span: config.span },
    };
  }

  // Include parent relationship from the start
  const flowModel: Partial<FlowModel> = {
    uid,
    use: 'DetailsItemModel',
    parentId: detailsUid,
    subKey: 'items',
    subType: 'array',
    sortIndex,
    stepParams,
    flowRegistry: {},
  };

  return { uid, flowModel };
}

/**
 * Generate a details action (edit, delete, link)
 *
 * @param config - Action configuration
 * @param detailsUid - UID of parent details block
 * @param sortIndex - Position among actions
 */
function generateDetailsAction(
  config: { type: string; label?: string },
  detailsUid: string,
  sortIndex: number
): GeneratedDetailsAction {
  const uid = generateUid();

  // Map action type to model type
  const actionModelMap: Record<string, string> = {
    edit: 'EditActionModel',
    delete: 'DeleteActionModel',
    link: 'LinkActionModel',
  };

  const modelType = actionModelMap[config.type] || 'ActionModel';

  const stepParams: Record<string, unknown> = {
    actionSettings: {
      init: {},
    },
  };

  if (config.label) {
    (stepParams.actionSettings as any).init.label = config.label;
  }

  // Include parent relationship from the start
  const flowModel: Partial<FlowModel> = {
    uid,
    use: modelType,
    parentId: detailsUid,
    subKey: 'actions',
    subType: 'array',
    sortIndex,
    stepParams,
    flowRegistry: {},
  };

  return { uid, flowModel };
}

/**
 * Save a DetailsBlockModel and its children to the database
 *
 * All flowModels already include parentId, subKey, subType from generation,
 * ensuring the closure table is populated correctly.
 */
export async function saveDetails(db: Database, details: GeneratedDetails): Promise<void> {
  const repo = db.getRepository('flowModels');

  // Save the details block itself (already has parent relationship)
  await repo.create({
    values: details.flowModel,
  });

  // Save items (already have parent relationship)
  for (const item of details.items) {
    await repo.create({
      values: item.flowModel,
    });
  }

  // Save actions (already have parent relationship)
  for (const action of details.actions) {
    await repo.create({
      values: action.flowModel,
    });
  }
}
