/**
 * JSON Configuration Types for UI Snapshot Plugin
 *
 * These types define the structure of JSON configuration files used to
 * define and recreate NocoBase UI pages programmatically.
 */

// ============================================================================
// Page Configuration
// ============================================================================

/**
 * Root page configuration
 */
export interface PageConfig {
  page: PageSettings;
  collections?: Record<string, string>; // Alias → internal collection name
  layout: LayoutConfig;
  blocks: Record<string, BlockConfig>;
}

/**
 * Page settings (title, icon, route)
 */
export interface PageSettings {
  title: string;
  icon?: string;
  route?: string; // Optional - auto-generated if omitted
}

// ============================================================================
// Layout Configuration
// ============================================================================

/**
 * Grid layout configuration (24-column system)
 */
export interface LayoutConfig {
  rows: LayoutRow[];
}

/**
 * A single row in the layout grid
 */
export interface LayoutRow {
  columns: LayoutColumn[];
}

/**
 * A column within a row
 */
export interface LayoutColumn {
  width: number; // Out of 24
  blocks: BlockReference[];
}

/**
 * Reference to a block definition
 */
export interface BlockReference {
  $ref: string; // e.g., "#/blocks/workstation_table"
}

// ============================================================================
// Block Configurations
// ============================================================================

/**
 * Union type for all block configurations
 */
export type BlockConfig = TableBlockConfig | ChartBlockConfig | DetailsBlockConfig | FormBlockConfig | MarkdownBlockConfig;

/**
 * Base properties shared by all blocks
 */
export interface BaseBlockConfig {
  type: string;
  collection: string; // Uses alias, resolved at creation time
  title?: string;
}

/**
 * Table block configuration
 */
export interface TableBlockConfig extends BaseBlockConfig {
  type: 'TableBlockModel';
  columns: TableColumnConfig[];
  toolbarActions?: ToolbarActionConfig[];
  rowActions?: RowActionConfig[];
  /** @deprecated Use toolbarActions instead */
  actions?: TableActionConfig[];
  defaultSort?: {
    field: string;
    order: 'asc' | 'desc';
  };
  pageSize?: number;
  quickEdit?: boolean;
}

/**
 * Table column configuration
 */
export interface TableColumnConfig {
  field: string;
  title?: string;
  width?: number;
  sortable?: boolean;
  fixed?: 'left' | 'right';
  hidden?: boolean;
  displayType?: 'text' | 'checkbox' | 'date' | 'number' | 'select' | 'tag' | 'link' | 'image';
  /** @deprecated Use displayType instead */
  fieldType?: 'text' | 'checkbox' | 'boolean';
  sortIndex?: number;
}

/**
 * Toolbar action configuration (filter, create, refresh, export)
 */
export interface ToolbarActionConfig {
  type: 'filter' | 'create' | 'refresh' | 'export';
}

/**
 * Row action configuration (view, edit, delete with inner pages)
 */
export interface RowActionConfig {
  type: 'view' | 'edit' | 'delete' | 'link' | 'popup';
  buttonType?: 'link' | 'primary' | 'default';
  confirmText?: string;
  innerPage?: InnerPageConfig;
}

/**
 * Inner page configuration (for view/edit popups)
 */
export interface InnerPageConfig {
  displayTitle?: boolean;
  enableTabs?: boolean;
  tabs?: TabConfig[];
}

/**
 * Tab configuration within inner page
 */
export interface TabConfig {
  title: string;
  icon?: string;
  blocks: BlockConfig[];
}

/**
 * Table action configuration
 * @deprecated Use ToolbarActionConfig or RowActionConfig instead
 */
export interface TableActionConfig {
  type: 'filter' | 'view' | 'edit' | 'delete' | 'create' | 'refresh' | 'export';
  position?: 'toolbar' | 'row';
  confirmText?: string;
}

/**
 * Chart block configuration
 */
export interface ChartBlockConfig extends BaseBlockConfig {
  type: 'ChartBlockModel';
  chart: ChartSettings;
}

/**
 * Chart settings
 */
export interface ChartSettings {
  type: 'pie' | 'bar' | 'line' | 'area' | 'scatter' | 'dualAxes';
  dimension: string; // X-axis field or pie category
  measure: ChartMeasure;
  secondaryMeasure?: ChartMeasure; // For dual axes
  options?: ChartOptions;
}

/**
 * Chart measure configuration
 */
export interface ChartMeasure {
  field: string;
  aggregation: 'count' | 'sum' | 'avg' | 'min' | 'max';
  alias?: string;
}

/**
 * Chart display options
 */
export interface ChartOptions {
  legend?: boolean;
  tooltip?: boolean;
  labelType?: 'percent' | 'value' | 'both' | 'none';
  colors?: string[];
  xAxisTitle?: string;
  yAxisTitle?: string;
}

/**
 * Details block configuration
 */
export interface DetailsBlockConfig extends BaseBlockConfig {
  type: 'DetailsBlockModel';
  fields: DetailsFieldConfig[];
  actions?: DetailsActionConfig[];
}

/**
 * Details field configuration
 */
export interface DetailsFieldConfig {
  field: string;
  title?: string;
  span?: number; // Grid span (out of 24)
}

/**
 * Details action configuration
 */
export interface DetailsActionConfig {
  type: 'edit' | 'delete' | 'link';
  label?: string;
}

/**
 * Form block configuration
 */
export interface FormBlockConfig extends BaseBlockConfig {
  type: 'FormBlockModel';
  fields: FormFieldConfig[];
  submitAction?: {
    label?: string;
    successMessage?: string;
  };
}

/**
 * Form field configuration
 */
export interface FormFieldConfig {
  field: string;
  title?: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: unknown;
}

/**
 * Markdown block configuration
 */
export interface MarkdownBlockConfig {
  type: 'MarkdownBlockModel';
  content: string;
}

// ============================================================================
// Full UI Snapshot
// ============================================================================

/**
 * Complete UI snapshot configuration
 */
export interface UISnapshotConfig {
  version: string;
  exported_at?: string;
  collections?: Record<string, string>;
  pages: PageSnapshotEntry[];
}

/**
 * Page entry in snapshot (can be include or inline)
 */
export interface PageSnapshotEntry {
  $include?: string;
  page?: PageConfig;
}

// ============================================================================
// Route/Page Resolution Types
// ============================================================================

/**
 * Resolved route information
 */
export interface ResolvedRoute {
  routeId: number;
  schemaUid: string;
  pageUid: string;
  title: string;
  path: string;
}

/**
 * Route hierarchy entry (from desktopRoutes)
 */
export interface RouteEntry {
  id: number;
  title: string;
  path?: string;
  schemaUid?: string;
  type?: 'group' | 'page';
  children?: RouteEntry[];
}

// ============================================================================
// FlowModel Types (Internal NocoBase Structure)
// ============================================================================

/**
 * FlowModel record structure
 */
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

/**
 * Grid settings within BlockGridModel stepParams
 */
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

/**
 * Create action request body - accepts PageConfig fields directly plus force option
 */
export interface CreateRequest extends PageConfig {
  force?: boolean;
}

/**
 * Create action response
 */
export interface CreateResponse {
  routeId: number;
  pageUid: string;
  blocksCreated: number;
  path: string;
}

/**
 * Delete action request body
 */
export interface DeleteRequest {
  path: string;
}

/**
 * Delete action response
 */
export interface DeleteResponse {
  deleted: boolean;
  path: string;
  flowModelsDeleted: number;
}

/**
 * Export action response (returns page config object directly)
 */
export interface ExportResponse extends PageConfig {
  path: string;
}

// ============================================================================
// Parsed/Validated Config Types
// ============================================================================

/**
 * Validated page config with resolved collection names
 */
export interface ValidatedPageConfig extends PageConfig {
  _resolvedCollections: Record<string, string>; // alias → actual internal name
}

/**
 * Block with resolved UID and collection
 */
export interface ResolvedBlock {
  uid: string;
  config: BlockConfig;
  collectionName: string; // Resolved internal name
}
