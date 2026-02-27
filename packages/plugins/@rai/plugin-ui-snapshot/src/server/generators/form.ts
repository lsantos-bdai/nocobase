/**
 * Form Generator
 *
 * Generates FormBlockModel flowModels for data entry forms.
 *
 * CRITICAL: All flowModels MUST include parentId, subKey, subType from the start.
 * This ensures the closure table (flowModelTreePath) is populated correctly.
 * See: nocobase-ui-manipulation.md lines 111-134
 */
import type { Database } from '@nocobase/database';
import type { FormBlockConfig, FlowModel } from '../types';
import { generateUid } from './uid';

export interface GeneratedForm {
  uid: string;
  flowModel: Partial<FlowModel>;
  items: GeneratedFormItem[];
  submitAction?: GeneratedFormAction;
}

export interface GeneratedFormItem {
  uid: string;
  flowModel: Partial<FlowModel>;
}

export interface GeneratedFormAction {
  uid: string;
  flowModel: Partial<FlowModel>;
}

/**
 * Generate a FormBlockModel from configuration
 *
 * @param config - Form block configuration
 * @param collectionName - Resolved collection name (internal t_xxx format)
 * @param parentId - UID of parent flowModel (BlockGridModel)
 * @param sortIndex - Position among siblings
 */
export function generateForm(
  config: FormBlockConfig,
  collectionName: string,
  parentId: string,
  sortIndex: number
): GeneratedForm {
  const uid = generateUid();

  // Include parent relationship from the start
  const flowModel: Partial<FlowModel> = {
    uid,
    use: 'FormBlockModel',
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

  // Generate field items with form as parent
  const items: GeneratedFormItem[] = config.fields.map((field, index) =>
    generateFormItem(field, collectionName, uid, index)
  );

  // Generate submit action with form as parent
  let submitAction: GeneratedFormAction | undefined;
  if (config.submitAction) {
    submitAction = generateSubmitAction(config.submitAction, uid);
  }

  return { uid, flowModel, items, submitAction };
}

/**
 * Generate a FormItemModel for a field
 *
 * @param config - Field configuration
 * @param collectionName - Resolved collection name
 * @param formUid - UID of parent form block
 * @param sortIndex - Position among items
 */
function generateFormItem(
  config: { field: string; title?: string; required?: boolean; placeholder?: string; defaultValue?: unknown },
  collectionName: string,
  formUid: string,
  sortIndex: number
): GeneratedFormItem {
  const uid = generateUid();

  const stepParams: Record<string, unknown> = {
    fieldSettings: {
      init: {
        dataSourceKey: 'main',
        collectionName,
        fieldPath: config.field,
      },
    },
    formItemSettings: {
      init: {},
    },
  };

  // Add optional settings
  if (config.required !== undefined) {
    (stepParams.formItemSettings as any).init.required = config.required;
  }
  if (config.placeholder) {
    (stepParams.formItemSettings as any).init.placeholder = config.placeholder;
  }
  if (config.defaultValue !== undefined) {
    (stepParams.formItemSettings as any).init.defaultValue = config.defaultValue;
  }

  // Include parent relationship from the start
  const flowModel: Partial<FlowModel> = {
    uid,
    use: 'FormItemModel',
    parentId: formUid,
    subKey: 'items',
    subType: 'array',
    sortIndex,
    stepParams,
    flowRegistry: {},
  };

  return { uid, flowModel };
}

/**
 * Generate a submit action for the form
 *
 * @param config - Submit action configuration
 * @param formUid - UID of parent form block
 */
function generateSubmitAction(
  config: { label?: string; successMessage?: string },
  formUid: string
): GeneratedFormAction {
  const uid = generateUid();

  const stepParams: Record<string, unknown> = {
    actionSettings: {
      init: {
        type: 'submit',
      },
    },
  };

  if (config.label) {
    (stepParams.actionSettings as any).init.label = config.label;
  }
  if (config.successMessage) {
    (stepParams.actionSettings as any).init.successMessage = config.successMessage;
  }

  // Include parent relationship from the start
  const flowModel: Partial<FlowModel> = {
    uid,
    use: 'SubmitActionModel',
    parentId: formUid,
    subKey: 'actions',
    subType: 'array',
    sortIndex: 0,
    stepParams,
    flowRegistry: {},
  };

  return { uid, flowModel };
}

/**
 * Save a FormBlockModel and its children to the database
 *
 * Uses FlowModelRepository.upsertModel() which correctly handles:
 * - The 'options' JSON column structure
 * - Tree path (closure table) creation for parent-child relationships
 */
export async function saveForm(db: Database, form: GeneratedForm): Promise<void> {
  const repo = db.getRepository('flowModels') as any;

  // Save the form block itself using upsertModel
  await repo.upsertModel(form.flowModel);

  // Save items using upsertModel
  for (const item of form.items) {
    await repo.upsertModel(item.flowModel);
  }

  // Save submit action if present using upsertModel
  if (form.submitAction) {
    await repo.upsertModel(form.submitAction.flowModel);
  }
}
