/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * Page Exporter Service
 *
 * Lossless export of NocoBase UI pages.
 * Preserves complete FlowModel state without transformation.
 */
import type { Database } from '@nocobase/database';
import type { FlowModel, PageSnapshot, UISnapshot } from '../types';
import { RouteResolver } from './route-resolver';

export class PageExporter {
  private routeResolver: RouteResolver;

  constructor(private db: Database) {
    this.routeResolver = new RouteResolver(db);
  }

  /**
   * Get all available page paths.
   */
  async getAllPagePaths() {
    return this.routeResolver.getAllPagePaths();
  }

  /**
   * Export a page by its route path.
   * Returns complete FlowModel tree without transformation.
   */
  async exportByPath(path: string): Promise<PageSnapshot> {
    const resolved = await this.routeResolver.resolveByPath(path);
    if (!resolved) {
      throw new Error(`Page not found at path: ${path}`);
    }

    return this.buildSnapshot(resolved.pageUid, resolved.title, path);
  }

  /**
   * Export all pages.
   */
  async exportAllPages(): Promise<UISnapshot> {
    const pages = await this.routeResolver.getAllPagePaths();
    const snapshots: PageSnapshot[] = [];

    for (const page of pages) {
      const resolved = await this.routeResolver.resolveByPath(page.path);
      if (!resolved) continue;

      const snapshot = await this.buildSnapshot(resolved.pageUid, page.path.split('/').pop() || '', page.path);
      snapshots.push(snapshot);
    }

    return {
      exported_at: new Date().toISOString(),
      pages: snapshots,
    };
  }

  /**
   * Build a complete page snapshot.
   */
  private async buildSnapshot(pageUid: string, title: string, path: string): Promise<PageSnapshot> {
    const tree = await this.routeResolver.getFlowModelTree(pageUid);

    // Build flowModels map and find root
    const flowModels: Record<string, FlowModel> = {};
    const collections = new Set<string>();
    let rootUid = pageUid;

    // Flatten tree into map and extract collections
    for (const model of tree) {
      flowModels[model.uid] = model;
      this.extractCollections(model, collections);

      // Find actual root (BlockGridModel or RootPageModel)
      if (model.use === 'BlockGridModel' || model.use === 'RootPageModel') {
        if (!model.parentId || model.parentId === pageUid) {
          rootUid = model.uid;
        }
      }
    }

    return {
      page: { title, route: path },
      rootUid,
      flowModels,
      collections: Array.from(collections),
    };
  }

  /**
   * Extract collection names from a FlowModel's stepParams.
   */
  private extractCollections(model: FlowModel, collections: Set<string>): void {
    const stepParams = model.stepParams || {};

    // Check common locations for collection references
    const collectionName =
      (stepParams.resourceSettings as any)?.init?.collectionName ||
      (stepParams.chartSettings as any)?.configure?.query?.collectionPath?.[1];

    if (collectionName) {
      collections.add(collectionName);
    }

    // Recursively check subModels
    if (model.subModels) {
      for (const subModel of Object.values(model.subModels)) {
        if (Array.isArray(subModel)) {
          subModel.forEach((m) => this.extractCollections(m, collections));
        } else if (subModel) {
          this.extractCollections(subModel, collections);
        }
      }
    }
  }
}
