import { Database } from '@nocobase/database';

export interface AuthInfo {
  userId: number | null;
  isApiKey: boolean;
}

/**
 * Extracts authentication information from the request context.
 * Determines whether the request was made via API key or user session.
 *
 * API key detection: JWT `temp` field is `undefined` or `false` for API keys,
 * `true` for user sessions.
 *
 * Note: ctx.state.currentUser is populated for both GUI and API key requests,
 * so we can always get userId from it. The user's nickname will be fetched
 * via the belongsTo relationship when listing snapshots.
 */
export async function extractAuthInfo(db: Database, options: any): Promise<AuthInfo> {
  const ctx = options.context;

  const userId = ctx?.state?.currentUser?.id ?? null;

  let isApiKey = false;

  // Detect if this is an API key request (for visual indicator)
  if (ctx?.getBearerToken && ctx?.app?.authManager?.jwt) {
    try {
      const token = ctx.getBearerToken();
      if (token) {
        const payload = await ctx.app.authManager.jwt.decode(token);
        // API key tokens have temp=undefined/false, user sessions have temp=true
        if (payload && !payload.temp) {
          isApiKey = true;
        }
      }
    } catch {
      // Ignore decode errors - just won't show API indicator
    }
  }

  return { userId, isApiKey };
}
