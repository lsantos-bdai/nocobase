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

  console.log('[CDC AUTH DEBUG] extractAuthInfo called');
  console.log('[CDC AUTH DEBUG] ctx exists:', !!ctx);
  console.log('[CDC AUTH DEBUG] ctx.state:', ctx?.state);
  console.log('[CDC AUTH DEBUG] ctx.state.currentUser:', ctx?.state?.currentUser);

  const userId = ctx?.state?.currentUser?.id ?? null;
  console.log('[CDC AUTH DEBUG] userId:', userId);

  let isApiKey = false;

  // Detect if this is an API key request (for visual indicator)
  console.log('[CDC AUTH DEBUG] getBearerToken exists:', !!ctx?.getBearerToken);
  console.log('[CDC AUTH DEBUG] authManager.jwt exists:', !!ctx?.app?.authManager?.jwt);

  if (ctx?.getBearerToken && ctx?.app?.authManager?.jwt) {
    try {
      const token = ctx.getBearerToken();
      console.log('[CDC AUTH DEBUG] token exists:', !!token);
      if (token) {
        const payload = await ctx.app.authManager.jwt.decode(token);
        console.log('[CDC AUTH DEBUG] payload:', payload);
        console.log('[CDC AUTH DEBUG] payload.temp:', payload?.temp);
        // API key tokens have temp=undefined/false, user sessions have temp=true
        if (payload && !payload.temp) {
          isApiKey = true;
        }
      }
    } catch (err) {
      console.log('[CDC AUTH DEBUG] decode error:', err);
      // Ignore decode errors - just won't show API indicator
    }
  }

  console.log('[CDC AUTH DEBUG] returning:', { userId, isApiKey });
  return { userId, isApiKey };
}
