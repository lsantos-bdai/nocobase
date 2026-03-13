import { Context } from '@nocobase/actions';

/**
 * Default and maximum values for pagination parameters.
 */
export const PAGINATION_DEFAULTS = {
  page: 1,
  pageSize: 50,
  maxPageSize: 300,
  maxAssets: 1000,
};

/**
 * Maximum number of items allowed in a single bulk mutation request.
 */
export const MAX_BATCH_SIZE = 100;

/**
 * Validate that a batch payload does not exceed the maximum allowed size.
 * Throws 400 if the array length exceeds MAX_BATCH_SIZE.
 */
export function validateBatchSize(ctx: Context, items: unknown[]): void {
  if (items.length > MAX_BATCH_SIZE) {
    ctx.throw(400, `Batch size ${items.length} exceeds maximum of ${MAX_BATCH_SIZE}`);
  }
}

/**
 * Standard paginated response metadata.
 */
export interface PaginatedMeta {
  page: number;
  pageSize: number;
  count: number;
  totalPage: number;
}

/**
 * Paginated response metadata for graph-based endpoints (get_relations=true).
 * Extends standard pagination with graph bounding info.
 */
export interface GraphPaginatedMeta {
  page: number;
  pageSize: number;
  count: number;
  totalPage: number;
  truncated: boolean;
  max_assets: number;
}

/**
 * Parse and validate pagination query parameters.
 * Throws 400 on invalid values — no silent clamping.
 */
export function parsePaginationParams(
  ctx: Context,
  pageStr?: string,
  pageSizeStr?: string,
): { page: number; pageSize: number } {
  let page = PAGINATION_DEFAULTS.page;
  let pageSize = PAGINATION_DEFAULTS.pageSize;

  if (pageStr !== undefined && pageStr !== '') {
    page = Number(pageStr);
    if (!Number.isInteger(page)) {
      ctx.throw(400, 'page must be an integer');
    }
    if (page < 1) {
      ctx.throw(400, 'page must be >= 1');
    }
  }

  if (pageSizeStr !== undefined && pageSizeStr !== '') {
    pageSize = Number(pageSizeStr);
    if (!Number.isInteger(pageSize)) {
      ctx.throw(400, 'pageSize must be an integer');
    }
    if (pageSize < 1 || pageSize > PAGINATION_DEFAULTS.maxPageSize) {
      ctx.throw(400, `pageSize must be between 1 and ${PAGINATION_DEFAULTS.maxPageSize}`);
    }
  }

  return { page, pageSize };
}

/**
 * Build pagination metadata for a paginated response.
 */
export function buildPaginatedMeta(page: number, pageSize: number, count: number): PaginatedMeta {
  return {
    page,
    pageSize,
    count,
    totalPage: Math.ceil(count / pageSize),
  };
}

/**
 * Build pagination metadata for a graph-based response (with relation expansion).
 */
export function buildGraphPaginatedMeta(
  page: number,
  pageSize: number,
  count: number,
  truncated: boolean,
  maxAssets: number,
): GraphPaginatedMeta {
  return {
    page,
    pageSize,
    count,
    totalPage: Math.ceil(count / pageSize),
    truncated,
    max_assets: maxAssets,
  };
}

/**
 * Parse and validate the max_assets query parameter.
 * Throws 400 on invalid values — no silent clamping, no upper limit.
 */
export function parseMaxAssets(ctx: Context, maxAssetsStr?: string): number {
  if (maxAssetsStr === undefined || maxAssetsStr === '') {
    return PAGINATION_DEFAULTS.maxAssets;
  }

  const maxAssets = Number(maxAssetsStr);
  if (!Number.isInteger(maxAssets)) {
    ctx.throw(400, 'max_assets must be an integer');
  }
  if (maxAssets < 1) {
    ctx.throw(400, 'max_assets must be >= 1');
  }

  return maxAssets;
}

