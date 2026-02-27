/**
 * UID Generator - same format as NocoBase (11 alphanumeric chars)
 */
export function generateUid(): string {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < 11; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
