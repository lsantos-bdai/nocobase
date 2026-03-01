/**
 * Importer Service
 *
 * Converts Recipe format → NocoBase flowModel tree.
 * Generates UIDs, builds tree structure, saves via FlowModelRepository.
 */
import type { Database } from '@nocobase/database';
import type { Application } from '@nocobase/server';
import type {
  Recipe,
  Block,
  TableBlock,
  ChartBlock,
  DetailsBlock,
  FormBlock,
  MarkdownBlock,
  ColumnConfig,
  RowAction,
  ToolbarAction,
  Popup,
  Tab,
  InlineBlock,
  FieldConfig,
  FormFieldConfig,
  BlockAction,
  FlowModel,
  CreateResponse,
  DisplayType,
} from '../types';
import { RouteResolver } from './route-resolver';
import { generateUid, generateRowId } from '../generators/uid';

interface GeneratedFlowModel {
  uid: string;
  use: string;
  parentId: string;
  subKey: string;
  subType: 'array' | 'object';
  sortIndex: number;
  stepParams: Record<string, unknown>;
  flowRegistry: Record<string, unknown>;
  subModels?: Record<string, any>;
}

export class Importer {
  private routeResolver: RouteResolver;
  private collectionMap: Map<string, string> = new Map(); // alias → t_xxx
  private generatedModels: GeneratedFlowModel[] = [];

  constructor(
    private db: Database,
    private app: Application
  ) {
    this.routeResolver = new RouteResolver(db);
  }

  /**
   * Import a Recipe and create the page
   */
  async import(recipe: Recipe, options?: { force?: boolean }): Promise<CreateResponse> {
    // Parse route path
    const routePath = recipe.page.route || recipe.page.title;
    const { parentPath, title } = this.routeResolver.parseRoutePath(routePath);

    // Check if page already exists
    const existing = await this.routeResolver.resolveByPath(routePath);
    if (existing) {
      if (options?.force) {
        await this.deletePage(existing.routeId, existing.pageUid);
      } else {
        throw new Error(`Page already exists: ${routePath}. Use force=true to overwrite.`);
      }
    }

    // Build collection map
    this.collectionMap.clear();
    if (recipe.collections) {
      for (const [alias, internal] of Object.entries(recipe.collections)) {
        this.collectionMap.set(alias, internal);
      }
    }

    // Generate UIDs for all components
    const schemaUid = generateUid();
    const tabsSchemaUid = generateUid();
    const rootPageUid = generateUid();
    const blockGridUid = generateUid();

    // Create route
    const { routeId } = await this.routeResolver.createRoute({
      title,
      parentPath: parentPath || undefined,
      schemaUid,
      tabsSchemaUid,
      icon: recipe.page.icon,
    });

    // Create uiSchema (FlowRoute placeholder)
    await this.createUiSchema(schemaUid);

    // Generate flowModels
    this.generatedModels = [];

    // 1. RootPageModel
    this.generatedModels.push({
      uid: rootPageUid,
      use: 'RootPageModel',
      parentId: schemaUid,
      subKey: 'page',
      subType: 'object',
      sortIndex: 0,
      stepParams: {},
      flowRegistry: {},
    });

    // 2. BlockGridModel with layout
    const gridSettings = this.generateGridSettings(recipe, blockGridUid);
    this.generatedModels.push({
      uid: blockGridUid,
      use: 'BlockGridModel',
      parentId: tabsSchemaUid,
      subKey: 'grid',
      subType: 'object',
      sortIndex: 0,
      stepParams: { gridSettings },
      flowRegistry: {},
    });

    // 3. Generate blocks
    let blockIndex = 0;
    const blockUidMap = new Map<string, string>(); // blockId → uid

    for (const [blockId, block] of Object.entries(recipe.blocks)) {
      const blockUid = generateUid();
      blockUidMap.set(blockId, blockUid);
      this.generateBlock(block, blockUid, blockGridUid, blockIndex++);
    }

    // Update grid settings with actual block UIDs
    this.updateGridSettingsWithUids(gridSettings, blockUidMap);

    // Save all flowModels in BFS order
    const repo = this.db.getRepository('flowModels') as any;
    for (const model of this.generatedModels) {
      await repo.upsertModel(model);
    }

    return {
      routeId,
      pageUid: rootPageUid,
      blocksCreated: this.generatedModels.length,
      path: routePath,
    };
  }

  /**
   * Generate grid settings from recipe layout
   */
  private generateGridSettings(
    recipe: Recipe,
    _blockGridUid: string
  ): { grid: { rows: Record<string, string[][]>; sizes: Record<string, number[]>; rowOrder: string[] } } {
    const rows: Record<string, string[][]> = {};
    const sizes: Record<string, number[]> = {};
    const rowOrder: string[] = [];

    for (const row of recipe.layout.rows) {
      const rowId = generateRowId();
      rowOrder.push(rowId);

      const rowColumns: string[][] = [];
      const rowSizes: number[] = [];

      for (const column of row.columns) {
        // Use block IDs as placeholders, will be replaced with UIDs later
        rowColumns.push([...column.blocks]);
        rowSizes.push(column.width);
      }

      rows[rowId] = rowColumns;
      sizes[rowId] = rowSizes;
    }

    return { grid: { rows, sizes, rowOrder } };
  }

  /**
   * Update grid settings with actual block UIDs
   */
  private updateGridSettingsWithUids(
    gridSettings: { grid: { rows: Record<string, string[][]>; sizes: Record<string, number[]>; rowOrder: string[] } },
    blockUidMap: Map<string, string>
  ): void {
    for (const rowId of Object.keys(gridSettings.grid.rows)) {
      const rowColumns = gridSettings.grid.rows[rowId];
      for (let i = 0; i < rowColumns.length; i++) {
        rowColumns[i] = rowColumns[i].map(blockId => blockUidMap.get(blockId) || blockId);
      }
    }
  }

  /**
   * Generate a block flowModel based on type
   */
  private generateBlock(block: Block, uid: string, parentId: string, sortIndex: number): void {
    switch (block.type) {
      case 'table':
        this.generateTableBlock(block, uid, parentId, sortIndex);
        break;
      case 'chart':
        this.generateChartBlock(block, uid, parentId, sortIndex);
        break;
      case 'details':
        this.generateDetailsBlock(block, uid, parentId, sortIndex);
        break;
      case 'form':
        this.generateFormBlock(block, uid, parentId, sortIndex);
        break;
      case 'markdown':
        this.generateMarkdownBlock(block, uid, parentId, sortIndex);
        break;
    }
  }

  /**
   * Generate TableBlockModel
   */
  private generateTableBlock(block: TableBlock, uid: string, parentId: string, sortIndex: number): void {
    const collectionName = this.resolveCollection(block.collection);

    const stepParams: Record<string, unknown> = {
      resourceSettings: {
        init: {
          dataSourceKey: 'main',
          collectionName,
        },
      },
      tableSettings: {
        init: {
          pageSize: block.pageSize || 20,
        },
      },
    };

    if (block.defaultSort) {
      (stepParams.tableSettings as any).init.defaultSort = [
        { field: block.defaultSort.field, order: block.defaultSort.order },
      ];
    }

    if (block.quickEdit !== undefined) {
      (stepParams.tableSettings as any).quickEdit = { editable: block.quickEdit };
    }

    this.generatedModels.push({
      uid,
      use: 'TableBlockModel',
      parentId,
      subKey: 'items',
      subType: 'array',
      sortIndex,
      stepParams,
      flowRegistry: {},
    });

    // Generate columns
    let columnIndex = 0;
    for (const column of block.columns) {
      const columnUid = generateUid();
      this.generateTableColumn(column, columnUid, uid, collectionName, columnIndex++);
    }

    // Generate toolbar actions
    if (block.actions?.toolbar) {
      let actionIndex = 0;
      for (const action of block.actions.toolbar) {
        const actionUid = generateUid();
        this.generateToolbarAction(action, actionUid, uid, actionIndex++);
      }
    }

    // Generate row actions (in TableActionsColumnModel)
    if (block.actions?.row && block.actions.row.length > 0) {
      const actionsColumnUid = generateUid();
      this.generateActionsColumn(block.actions.row, actionsColumnUid, uid, collectionName, columnIndex);
    }
  }

  /**
   * Generate TableColumnModel
   */
  private generateTableColumn(
    column: string | ColumnConfig,
    uid: string,
    tableUid: string,
    collectionName: string,
    sortIndex: number
  ): void {
    const field = typeof column === 'string' ? column : column.field;
    const config = typeof column === 'string' ? {} : column;

    const displayModel = this.mapDisplayTypeToModel(config.displayType);
    const fieldUid = generateUid();

    const stepParams: Record<string, unknown> = {
      fieldSettings: {
        init: {
          dataSourceKey: 'main',
          collectionName,
          fieldPath: field,
        },
      },
      tableColumnSettings: {
        model: { use: displayModel },
      },
    };

    if (config.width) {
      (stepParams.tableColumnSettings as any).width = { width: config.width };
    }
    if (config.sortable !== undefined) {
      (stepParams.tableColumnSettings as any).sorter = { sorter: config.sortable };
    }
    if (config.fixed) {
      (stepParams.tableColumnSettings as any).fixed = { fixed: config.fixed };
    }

    this.generatedModels.push({
      uid,
      use: 'TableColumnModel',
      parentId: tableUid,
      subKey: 'columns',
      subType: 'array',
      sortIndex,
      stepParams,
      flowRegistry: {},
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
    });
  }

  /**
   * Map displayType to NocoBase display model
   */
  private mapDisplayTypeToModel(displayType: DisplayType | undefined): string {
    if (!displayType) return 'DisplayTextFieldModel';

    const map: Record<string, string> = {
      text: 'DisplayTextFieldModel',
      checkbox: 'DisplayCheckboxFieldModel',
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
   * Generate toolbar action
   */
  private generateToolbarAction(action: ToolbarAction, uid: string, tableUid: string, sortIndex: number): void {
    const modelMap: Record<string, string> = {
      filter: 'FilterActionModel',
      create: 'CreateActionModel',
      refresh: 'RefreshActionModel',
      export: 'ExportActionModel',
    };

    this.generatedModels.push({
      uid,
      use: modelMap[action] || 'ActionModel',
      parentId: tableUid,
      subKey: 'actions',
      subType: 'array',
      sortIndex,
      stepParams: { actionSettings: { init: {} } },
      flowRegistry: {},
    });
  }

  /**
   * Generate TableActionsColumnModel with row actions
   */
  private generateActionsColumn(
    rowActions: RowAction[],
    uid: string,
    tableUid: string,
    collectionName: string,
    sortIndex: number
  ): void {
    this.generatedModels.push({
      uid,
      use: 'TableActionsColumnModel',
      parentId: tableUid,
      subKey: 'columns',
      subType: 'array',
      sortIndex,
      stepParams: {
        tableColumnSettings: {
          title: { title: 'Actions' },
          width: { width: 200 },
        },
      },
      flowRegistry: {},
    });

    // Generate row actions
    let actionIndex = 0;
    for (const action of rowActions) {
      const actionUid = generateUid();
      this.generateRowAction(action, actionUid, uid, collectionName, actionIndex++);
    }
  }

  /**
   * Generate row action
   */
  private generateRowAction(
    action: RowAction,
    uid: string,
    actionsColumnUid: string,
    collectionName: string,
    sortIndex: number
  ): void {
    if (action === 'delete') {
      this.generatedModels.push({
        uid,
        use: 'DeleteActionModel',
        parentId: actionsColumnUid,
        subKey: 'actions',
        subType: 'array',
        sortIndex,
        stepParams: {
          buttonSettings: { general: { type: 'link', icon: null } },
          actionSettings: { init: {} },
        },
        flowRegistry: {},
      });
      return;
    }

    // View or Edit action with popup
    const modelType = action.type === 'view' ? 'ViewActionModel' : 'EditActionModel';

    this.generatedModels.push({
      uid,
      use: modelType,
      parentId: actionsColumnUid,
      subKey: 'actions',
      subType: 'array',
      sortIndex,
      stepParams: {
        buttonSettings: { general: { type: 'link', icon: null } },
        actionSettings: { init: {} },
      },
      flowRegistry: {},
    });

    // Generate popup
    const pageUid = generateUid();
    this.generatePopup(action.popup, pageUid, uid, collectionName);
  }

  /**
   * Generate popup (ChildPageModel with tabs)
   */
  private generatePopup(popup: Popup, uid: string, actionUid: string, collectionName: string): void {
    const stepParams: Record<string, unknown> = {
      // Correct path: pageSettings.general (not childPageSettings.title)
      pageSettings: {
        general: {
          displayTitle: popup.displayTitle ?? false,
          enableTabs: true,
        },
      },
    };

    this.generatedModels.push({
      uid,
      use: 'ChildPageModel',
      parentId: actionUid,
      subKey: 'page',
      subType: 'object',
      sortIndex: 0,
      stepParams,
      flowRegistry: {},
    });

    // Generate tabs
    let tabIndex = 0;
    for (const tab of popup.tabs) {
      const tabUid = generateUid();
      this.generateTab(tab, tabUid, uid, collectionName, tabIndex++);
    }
  }

  /**
   * Generate tab (ChildPageTabModel with grid)
   */
  private generateTab(tab: Tab, uid: string, pageUid: string, collectionName: string, sortIndex: number): void {
    this.generatedModels.push({
      uid,
      use: 'ChildPageTabModel',
      parentId: pageUid,
      subKey: 'tabs',
      subType: 'array',
      sortIndex,
      stepParams: {
        // Correct path: pageTabSettings.tab.title (not tabSettings.title.title)
        pageTabSettings: { tab: { title: tab.title } },
      },
      flowRegistry: {},
    });

    // Generate BlockGridModel for tab
    const gridUid = generateUid();
    const gridSettings = this.generateTabGridSettings(tab.blocks);

    this.generatedModels.push({
      uid: gridUid,
      use: 'BlockGridModel',
      parentId: uid,
      subKey: 'grid',
      subType: 'object',
      sortIndex: 0,
      stepParams: { gridSettings },
      flowRegistry: {},
    });

    // Generate blocks in tab
    let blockIndex = 0;
    const blockUidMap = new Map<string, string>();

    for (let i = 0; i < tab.blocks.length; i++) {
      const block = tab.blocks[i];
      const blockUid = generateUid();
      blockUidMap.set(`block_${i}`, blockUid);
      this.generateInlineBlock(block, blockUid, gridUid, collectionName, blockIndex++);
    }

    // Update grid settings with actual UIDs
    this.updateGridSettingsWithUids(gridSettings, blockUidMap);
  }

  /**
   * Generate simple grid settings for tab blocks (single column)
   */
  private generateTabGridSettings(
    blocks: InlineBlock[]
  ): { grid: { rows: Record<string, string[][]>; sizes: Record<string, number[]>; rowOrder: string[] } } {
    const rowId = generateRowId();
    const blockIds = blocks.map((_, i) => `block_${i}`);

    return {
      grid: {
        rows: { [rowId]: [blockIds] },
        sizes: { [rowId]: [24] },
        rowOrder: [rowId],
      },
    };
  }

  /**
   * Generate inline block for popups
   */
  private generateInlineBlock(
    block: InlineBlock,
    uid: string,
    gridUid: string,
    parentCollectionName: string,
    sortIndex: number
  ): void {
    switch (block.type) {
      case 'details':
        this.generateDetailsBlock(
          { ...block, type: 'details' } as DetailsBlock,
          uid,
          gridUid,
          sortIndex,
          parentCollectionName
        );
        break;
      case 'form':
        // Use EditFormModel for popup forms (not FormBlockModel)
        this.generateEditFormBlock(
          { ...block, type: 'form' } as FormBlock,
          uid,
          gridUid,
          sortIndex,
          parentCollectionName
        );
        break;
      case 'markdown':
        this.generateMarkdownBlock({ ...block, type: 'markdown' } as MarkdownBlock, uid, gridUid, sortIndex);
        break;
    }
  }

  /**
   * Generate EditFormModel for popup forms
   * Structure: EditFormModel → FormGridModel → FormItemModel[]
   */
  private generateEditFormBlock(
    block: FormBlock,
    uid: string,
    parentId: string,
    sortIndex: number,
    overrideCollection?: string
  ): void {
    const collectionName = overrideCollection || this.resolveCollection(block.collection);

    // Generate EditFormModel
    this.generatedModels.push({
      uid,
      use: 'EditFormModel',
      parentId,
      subKey: 'items',
      subType: 'array',
      sortIndex,
      stepParams: {
        resourceSettings: {
          init: {
            dataSourceKey: 'main',
            collectionName,
            filterByTk: '{{ctx.view.inputArgs.filterByTk}}',
          },
        },
      },
      flowRegistry: {},
    });

    // Generate FormGridModel
    const formGridUid = generateUid();
    this.generatedModels.push({
      uid: formGridUid,
      use: 'FormGridModel',
      parentId: uid,
      subKey: 'grid',
      subType: 'object',
      sortIndex: 0,
      stepParams: {},
      flowRegistry: {},
    });

    // Generate fields under FormGridModel
    let fieldIndex = 0;
    for (const field of block.fields) {
      const fieldUid = generateUid();
      this.generateFormField(field, fieldUid, formGridUid, collectionName, fieldIndex++);
    }

    // Generate FormSubmitActionModel
    const submitUid = generateUid();
    this.generatedModels.push({
      uid: submitUid,
      use: 'FormSubmitActionModel',
      parentId: uid,
      subKey: 'actions',
      subType: 'array',
      sortIndex: 0,
      stepParams: {
        buttonSettings: {
          general: {
            type: 'primary',
          },
        },
      },
      flowRegistry: {},
    });
  }

  /**
   * Generate ChartBlockModel
   */
  private generateChartBlock(block: ChartBlock, uid: string, parentId: string, sortIndex: number): void {
    const collectionName = this.resolveCollection(block.collection);

    const stepParams: Record<string, unknown> = {
      chartSettings: {
        configure: {
          query: {
            collectionPath: ['main', collectionName],
            measures: [{ field: [block.measure.field], aggregation: block.measure.aggregation }],
            dimensions: [{ field: [block.dimension] }],
            orders: [],
            mode: 'builder',
          },
          chart: {
            option: {
              mode: 'basic',
              builder: {
                type: block.chartType,
                xField: block.dimension,
                yField: block.measure.field,
                legend: block.options?.legend ?? true,
                tooltip: block.options?.tooltip ?? true,
              },
            },
          },
        },
      },
    };

    this.generatedModels.push({
      uid,
      use: 'ChartBlockModel',
      parentId,
      subKey: 'items',
      subType: 'array',
      sortIndex,
      stepParams,
      flowRegistry: {},
    });
  }

  /**
   * Generate DetailsBlockModel
   */
  private generateDetailsBlock(
    block: DetailsBlock,
    uid: string,
    parentId: string,
    sortIndex: number,
    overrideCollection?: string
  ): void {
    const collectionName = overrideCollection || this.resolveCollection(block.collection);

    this.generatedModels.push({
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
    });

    // Generate DetailsGridModel
    const gridUid = generateUid();
    this.generatedModels.push({
      uid: gridUid,
      use: 'DetailsGridModel',
      parentId: uid,
      subKey: 'grid',
      subType: 'object',
      sortIndex: 0,
      stepParams: {},
      flowRegistry: {},
    });

    // Generate fields
    let fieldIndex = 0;
    for (const field of block.fields) {
      const fieldUid = generateUid();
      this.generateDetailsField(field, fieldUid, gridUid, collectionName, fieldIndex++);
    }

    // Generate actions
    if (block.actions) {
      let actionIndex = 0;
      for (const action of block.actions) {
        const actionUid = generateUid();
        this.generateBlockAction(action, actionUid, uid, collectionName, actionIndex++);
      }
    }
  }

  /**
   * Generate DetailsItemModel
   */
  private generateDetailsField(
    field: string | FieldConfig,
    uid: string,
    gridUid: string,
    collectionName: string,
    sortIndex: number
  ): void {
    const fieldPath = typeof field === 'string' ? field : field.field;
    const span = typeof field === 'string' ? undefined : field.span;
    const displayFieldUid = generateUid();

    const stepParams: Record<string, unknown> = {
      fieldSettings: {
        init: {
          dataSourceKey: 'main',
          collectionName,
          fieldPath,
        },
      },
    };

    if (span) {
      (stepParams as any).detailsItemSettings = { span: { span } };
    }

    this.generatedModels.push({
      uid,
      use: 'DetailsItemModel',
      parentId: gridUid,
      subKey: 'items',
      subType: 'array',
      sortIndex,
      stepParams,
      flowRegistry: {},
      subModels: {
        field: {
          uid: displayFieldUid,
          use: 'DisplayTextFieldModel',
          props: null,
          parentId: uid,
          subKey: 'field',
          subType: 'object',
          stepParams: {},
          sortIndex: 0,
          flowRegistry: {},
        },
      },
    });
  }

  /**
   * Generate FormBlockModel
   */
  private generateFormBlock(
    block: FormBlock,
    uid: string,
    parentId: string,
    sortIndex: number,
    overrideCollection?: string
  ): void {
    const collectionName = overrideCollection || this.resolveCollection(block.collection);

    this.generatedModels.push({
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
    });

    // Generate fields
    let fieldIndex = 0;
    for (const field of block.fields) {
      const fieldUid = generateUid();
      this.generateFormField(field, fieldUid, uid, collectionName, fieldIndex++);
    }

    // Generate actions
    if (block.actions) {
      let actionIndex = 0;
      for (const action of block.actions) {
        const actionUid = generateUid();
        this.generateBlockAction(action, actionUid, uid, collectionName, actionIndex++);
      }
    }
  }

  /**
   * Generate FormItemModel
   */
  private generateFormField(
    field: string | FormFieldConfig,
    uid: string,
    formUid: string,
    collectionName: string,
    sortIndex: number
  ): void {
    const fieldPath = typeof field === 'string' ? field : field.field;
    const config = typeof field === 'string' ? {} : field;
    const inputFieldUid = generateUid();

    const stepParams: Record<string, unknown> = {
      fieldSettings: {
        init: {
          dataSourceKey: 'main',
          collectionName,
          fieldPath,
        },
      },
    };

    if (config.required || config.placeholder) {
      (stepParams as any).formItemSettings = {};
      if (config.required) {
        (stepParams as any).formItemSettings.required = { required: config.required };
      }
      if (config.placeholder) {
        (stepParams as any).formItemSettings.placeholder = { placeholder: config.placeholder };
      }
    }

    this.generatedModels.push({
      uid,
      use: 'FormItemModel',
      parentId: formUid,
      subKey: 'items',
      subType: 'array',
      sortIndex,
      stepParams,
      flowRegistry: {},
      subModels: {
        field: {
          uid: inputFieldUid,
          use: 'InputFieldModel',
          props: null,
          parentId: uid,
          subKey: 'field',
          subType: 'object',
          stepParams: {},
          sortIndex: 0,
          flowRegistry: {},
        },
      },
    });
  }

  /**
   * Generate block action (edit/delete)
   */
  private generateBlockAction(
    action: BlockAction,
    uid: string,
    blockUid: string,
    _collectionName: string,
    sortIndex: number
  ): void {
    if (action === 'edit') {
      this.generatedModels.push({
        uid,
        use: 'EditActionModel',
        parentId: blockUid,
        subKey: 'actions',
        subType: 'array',
        sortIndex,
        stepParams: { actionSettings: { init: {} } },
        flowRegistry: {},
      });
    } else if (action === 'delete') {
      this.generatedModels.push({
        uid,
        use: 'DeleteActionModel',
        parentId: blockUid,
        subKey: 'actions',
        subType: 'array',
        sortIndex,
        stepParams: { actionSettings: { init: {} } },
        flowRegistry: {},
      });
    }
    // TODO: Handle popup actions
  }

  /**
   * Generate MarkdownBlockModel
   */
  private generateMarkdownBlock(block: MarkdownBlock, uid: string, parentId: string, sortIndex: number): void {
    this.generatedModels.push({
      uid,
      use: 'MarkdownBlockModel',
      parentId,
      subKey: 'items',
      subType: 'array',
      sortIndex,
      stepParams: {
        markdownSettings: {
          content: { content: block.content },
        },
      },
      flowRegistry: {},
    });
  }

  /**
   * Resolve collection alias to internal name
   */
  private resolveCollection(alias: string): string {
    return this.collectionMap.get(alias) || alias;
  }

  /**
   * Create uiSchema (FlowRoute placeholder)
   */
  private async createUiSchema(schemaUid: string): Promise<void> {
    const repo = this.db.getRepository('uiSchemas') as any;

    // Use insert if available, otherwise create
    if (typeof repo.insert === 'function') {
      await repo.insert({
        type: 'void',
        'x-component': 'FlowRoute',
        'x-uid': schemaUid,
      });
    } else {
      await repo.create({
        values: {
          'x-uid': schemaUid,
          type: 'void',
          'x-component': 'FlowRoute',
        },
      });
    }
  }

  /**
   * Delete a page (route and flowModels)
   */
  private async deletePage(routeId: number, pageUid: string): Promise<void> {
    // Delete route (cascades to children)
    await this.routeResolver.deleteRoute(routeId);

    // Delete flowModels
    const flowModelRepo = this.db.getRepository('flowModels') as any;

    // Use FlowModelRepository's remove method if available (handles tree deletion)
    if (typeof flowModelRepo.remove === 'function') {
      await flowModelRepo.remove(pageUid);
    } else {
      // Fallback: delete by uid
      await flowModelRepo.destroy({ filterByTk: pageUid });
    }
  }
}
