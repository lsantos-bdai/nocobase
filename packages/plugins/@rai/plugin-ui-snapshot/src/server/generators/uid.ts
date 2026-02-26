/**
 * UID Generator
 *
 * Generates unique identifiers for flowModels in the same format as NocoBase.
 */

/**
 * Generate a unique ID similar to NocoBase format (11 alphanumeric chars)
 */
export function generateUid(): string {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < 11; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate a row ID for grid layouts
 */
export function generateRowId(): string {
  return `row_${generateUid()}`;
}
