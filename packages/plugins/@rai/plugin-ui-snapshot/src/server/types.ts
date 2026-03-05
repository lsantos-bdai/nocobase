/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * UI Snapshot Types
 *
 * Single format: PageSnapshot - lossless FlowModel export/import.
 */

/**
 * FlowModel - complete NocoBase UI model structure.
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
 * PageSnapshot - the only format for export and import.
 */
export interface PageSnapshot {
  page: {
    title: string;
    route: string;
  };
  rootUid: string;
  flowModels: Record<string, FlowModel>;
  collections: string[];
}

/**
 * Route resolution types.
 */
export interface ResolvedRoute {
  routeId: number;
  schemaUid: string;
  pageUid: string;
  title: string;
  path: string;
}

export interface RouteEntry {
  id: number;
  title: string | null;
  schemaUid?: string;
  type?: 'group' | 'page' | 'flowPage' | 'tabs';
  children?: RouteEntry[];
}

/**
 * API types.
 */
export interface CreateRequest extends PageSnapshot {}

export interface CreateResponse {
  routeId: number;
  pageUid: string;
  modelsImported: number;
  path: string;
}

export interface DeleteResponse {
  deleted: boolean;
  path: string;
  flowModelsDeleted: number;
}

/**
 * Block template types — for cross-server template migration.
 *
 * Targets the Gen 3 template system: flowModelTemplates + flowModels.
 */

/**
 * Template metadata from the flowModelTemplates table.
 */
export interface TemplateRecord {
  uid: string;
  name: string;
  description?: string;
  targetUid: string;
  useModel?: string;
  type?: string;
  dataSourceKey?: string;
  collectionName?: string;
  associationName?: string;
  filterByTk?: string;
  sourceId?: string;
}

/**
 * A complete template export — metadata + full flowModel tree.
 */
export interface TemplateSnapshot {
  template: TemplateRecord;
  model: Record<string, unknown>;
}

/**
 * Response from the importTemplates endpoint.
 */
export interface TemplateImportResponse {
  imported: boolean;
  uid: string;
  name: string;
}
