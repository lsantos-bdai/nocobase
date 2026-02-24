import { Context, Next } from '@nocobase/actions';
import { getPlatformBySlugOrThrow } from '../utils';

/**
 * Index action - returns a dictionary where each key is a collection title
 * and the value is a list of all asset names in that collection.
 *
 * Query parameters:
 * - platform: Platform slug (required)
 */
export async function indexAssets(ctx: Context, next: Next) {
  const { platform } = ctx.request.query as {
    platform?: string;
  };

  if (!platform) {
    ctx.throw(400, 'platform query parameter is required');
  }

  const platformRecord = await getPlatformBySlugOrThrow(ctx, platform);

  // Query the lookup table - collectionTitle is stored with each entry
  const lookupEntries = await ctx.db.getRepository(platformRecord.collectionName).find({
    fields: ['name', 'collectionTitle'],
  });

  // Group asset names by collection title
  const result: Record<string, string[]> = {};

  for (const entry of lookupEntries) {
    const collectionTitle = entry.collectionTitle as string;
    const assetName = entry.name as string;

    if (!result[collectionTitle]) {
      result[collectionTitle] = [];
    }
    result[collectionTitle].push(assetName);
  }

  ctx.body = result;
  ctx.withoutDataWrapping = true;
  await next();
}
