import { Database, Model } from '@nocobase/database';

/**
 * Options passed to Sequelize hooks
 */
export interface HookOptions {
  transaction?: any;
  context?: Record<string, unknown>;
  logging?: boolean;
  hooks?: boolean;
}

/**
 * CDC context data stored between before/after hooks
 */
export interface CdcContext {
  beforeData: Record<string, unknown>;
  recordId: string;
  collectionName: string;
}

/**
 * Logger interface for CDC hooks
 */
export interface Logger {
  error: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  debug: (...args: any[]) => void;
}

/**
 * Result of hook context validation
 */
export interface HookValidationResult {
  collectionName: string;
  recordId: string;
}

/**
 * Parameters for creating a CDC snapshot
 */
export interface CreateSnapshotParams {
  collectionName: string;
  recordId: string;
  operation: 'create' | 'update' | 'destroy';
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  changedFields: string[];
}

/**
 * Type for hook factory functions
 */
export type HookFactory = (db: Database, logger?: Logger) => (model: Model, options: HookOptions) => Promise<void>;
