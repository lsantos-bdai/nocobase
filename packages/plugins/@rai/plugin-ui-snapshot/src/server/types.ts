/**
 * Recipe Format Types
 *
 * A "recipe" is a human-readable JSON configuration (~100 lines) that can
 * losslessly recreate a full NocoBase flowModel tree (~22k lines).
 *
 * Key Principle: Export → Import → Export should produce identical JSON (except UIDs).
 */

// ============================================================================
// Recipe Format (Top Level)
// ============================================================================

export interface Recipe {
  page: PageConfig;
  collections?: Record<string, string>; // alias → t_xxx
  layout: Layout;
  blocks: Record<string, Block>;
}

export interface PageConfig {
  title: string;
  route?: string;
  icon?: string;
}

// ============================================================================
// Layout Configuration
// ============================================================================

export interface Layout {
  rows: Row[];
}

export interface Row {
  columns: Column[];
}

export interface Column {
  width: number; // out of 24
  blocks: string[]; // block IDs referencing keys in Recipe.blocks
}

// ============================================================================
// Block Types (Discriminated Union)
// ============================================================================

export type Block =
  | TableBlock
  | ChartBlock
  | DetailsBlock
  | FormBlock
  | MarkdownBlock;

// ----------------------------------------------------------------------------
// Table Block
// ----------------------------------------------------------------------------

export interface TableBlock {
  type: 'table';
  collection: string;
  columns: (string | ColumnConfig)[];
  actions?: {
    toolbar?: ToolbarAction[];
    row?: RowAction[];
  };
  pageSize?: number;
  defaultSort?: { field: string; order: 'asc' | 'desc' };
  quickEdit?: boolean;
}

export interface ColumnConfig {
  field: string;
  displayType?: DisplayType;
  width?: number;
  sortable?: boolean;
  fixed?: 'left' | 'right';
  popup?: Popup; // For relation field click popups
}

export type DisplayType =
  | 'text'
  | 'checkbox'
  | 'date'
  | 'number'
  | 'select'
  | 'tag'
  | 'link'
  | 'image';

export type ToolbarAction = 'filter' | 'create' | 'refresh' | 'export';

export type RowAction = 'delete' | ViewAction | EditAction;

export interface ViewAction {
  type: 'view';
  popup: Popup;
}

export interface EditAction {
  type: 'edit';
  popup: Popup;
}

// ----------------------------------------------------------------------------
// Popup (for View/Edit Actions)
// ----------------------------------------------------------------------------

export interface Popup {
  displayTitle?: boolean;
  tabs: Tab[];
}

export interface Tab {
  title: string;
  icon?: string;
  blocks: InlineBlock[]; // inline block definitions (NocoBase tree model requires this)
}

// Inline blocks for popups - same as Block but without 'table' type to avoid recursion issues
export type InlineBlock =
  | DetailsBlockInline
  | FormBlockInline
  | MarkdownBlockInline;

export interface DetailsBlockInline {
  type: 'details';
  collection: string;
  fields: (string | FieldConfig)[];
  actions?: BlockAction[];
}

export interface FormBlockInline {
  type: 'form';
  collection: string;
  fields: (string | FormFieldConfig)[];
  actions?: BlockAction[];
}

export interface MarkdownBlockInline {
  type: 'markdown';
  content: string;
}

// ----------------------------------------------------------------------------
// Chart Block
// ----------------------------------------------------------------------------

export interface ChartBlock {
  type: 'chart';
  collection: string;
  chartType: 'pie' | 'bar' | 'line' | 'area';
  dimension: string;
  measure: { field: string; aggregation: Aggregation };
  options?: { legend?: boolean; tooltip?: boolean };
}

export type Aggregation = 'count' | 'sum' | 'avg' | 'min' | 'max';

// ----------------------------------------------------------------------------
// Details Block
// ----------------------------------------------------------------------------

export interface DetailsBlock {
  type: 'details';
  collection: string;
  fields: (string | FieldConfig)[];
  actions?: BlockAction[];
}

export interface FieldConfig {
  field: string;
  span?: number; // grid span out of 24
}

export type BlockAction = 'edit' | 'delete' | { type: 'edit' | 'view'; popup: Popup };

// ----------------------------------------------------------------------------
// Form Block
// ----------------------------------------------------------------------------

export interface FormBlock {
  type: 'form';
  collection: string;
  fields: (string | FormFieldConfig)[];
  actions?: BlockAction[];
}

export interface FormFieldConfig {
  field: string;
  required?: boolean;
  placeholder?: string;
}

// ----------------------------------------------------------------------------
// Markdown Block
// ----------------------------------------------------------------------------

export interface MarkdownBlock {
  type: 'markdown';
  content: string;
}

// ============================================================================
// Route/Page Resolution Types (used by route-resolver.ts)
// ============================================================================

export interface ResolvedRoute {
  routeId: number;
  schemaUid: string;
  pageUid: string;
  title: string;
  path: string;
}

export interface RouteEntry {
  id: number;
  title: string;
  path?: string;
  schemaUid?: string;
  type?: string;
  children?: RouteEntry[];
}

// ============================================================================
// FlowModel Types (Internal NocoBase Structure)
// ============================================================================

export interface FlowModel {
  uid: string;
  name?: string;
  use: string;
  parentId?: string;
  subKey?: string;
  subType?: 'array' | 'object';
  sortIndex?: number;
  stepParams: Record<string, unknown>;
  flowRegistry?: Record<string, unknown>;
  subModels?: Record<string, FlowModel | FlowModel[]>;
}

export interface GridSettings {
  grid: {
    rows: Record<string, string[][]>; // rowId → columns (each column is array of block UIDs)
    sizes: Record<string, number[]>; // rowId → column widths
    rowOrder: string[];
  };
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface CreateRequest extends Recipe {
  force?: boolean;
}

export interface CreateResponse {
  routeId: number;
  pageUid: string;
  blocksCreated: number;
  path: string;
}

export interface DeleteRequest {
  path: string;
}

export interface DeleteResponse {
  deleted: boolean;
  path: string;
  flowModelsDeleted: number;
}

export type ExportResponse = Recipe;
