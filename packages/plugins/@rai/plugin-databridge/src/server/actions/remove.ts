import { Context, Next } from '@nocobase/actions';
import { getPlatformOrThrow, getLookupRepoOrThrow, updateRegisteredCollections, resolveCollectionBasic } from '../utils';

export async function removePlatformCollections(ctx: Context, next: Next) {
  const platformIdentifier = ctx.action.params.platform || ctx.request.query.platform;
  const { collections = [] } = ctx.action.params.values || {};

  if (!platformIdentifier) {
    ctx.throw(400, 'platform parameter (id or slug) is required');
    return;
  }

  if (!collections || collections.length === 0) {
    ctx.throw(400, 'collections array is required and must not be empty');
    return;
  }

  const platformRecord = await getPlatformOrThrow(ctx, platformIdentifier);
  const lookupRepo = await getLookupRepoOrThrow(ctx, platformRecord);

  // Resolve collection names (supports case-insensitive title matching)
  const resolvedCollections: string[] = [];
  for (const collName of collections) {
    const resolved = await resolveCollectionBasic(ctx, ctx.db, collName);
    resolvedCollections.push(resolved);
  }

  let removed = 0;
  for (const collName of resolvedCollections) {
    const deleted = await lookupRepo.destroy({
      filter: { collection: collName },
    });
    removed += typeof deleted === 'number' ? deleted : 0;
  }

  await updateRegisteredCollections(ctx, platformIdentifier, [], resolvedCollections);

  ctx.body = { removed, collections: resolvedCollections };
  ctx.withoutDataWrapping = true;
  await next();
}
