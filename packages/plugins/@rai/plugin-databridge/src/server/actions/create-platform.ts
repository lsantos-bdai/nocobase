import { Context, Next } from '@nocobase/actions';

export async function createPlatform(ctx: Context, next: Next) {
  const { name, slug, description } = ctx.action.params.values || {};

  if (!name || !slug) {
    ctx.throw(400, 'name and slug are required');
  }

  // Validate slug format (lowercase, alphanumeric, underscores)
  if (!/^[a-z][a-z0-9_]*$/.test(slug)) {
    ctx.throw(
      400,
      'slug must start with lowercase letter and contain only lowercase letters, numbers, and underscores',
    );
  }

  const collectionName = `platform_${slug}`;

  // Check if platform already exists
  const existing = await ctx.db.getRepository('databridge_platforms').findOne({
    filter: { $or: [{ slug }, { collectionName }] },
  });

  if (existing) {
    ctx.throw(409, `Platform with slug '${slug}' already exists`);
  }

  // 1. Create the platform collection via NocoBase's collection manager
  await ctx.db.getRepository('collections').create({
    values: {
      name: collectionName,
      title: `${name} Platform`,
      hidden: true,
      autoGenId: false,
      fields: [
        {
          type: 'string',
          name: 'name',
          primaryKey: true,
          interface: 'input',
          uiSchema: { title: 'Asset Name', required: true },
        },
        {
          type: 'string',
          name: 'collection',
          interface: 'input',
          uiSchema: { title: 'Source Collection', required: true },
        },
        {
          type: 'string',
          name: 'collectionTitle',
          interface: 'input',
          uiSchema: { title: 'Collection Title', required: true },
        },
        {
          type: 'string',
          name: 'assetId',
          interface: 'input',
          uiSchema: { title: 'Asset ID', required: true },
        },
      ],
    },
    context: {},
  });

  // 2. Register in directory
  const platform = await ctx.db.getRepository('databridge_platforms').create({
    values: { name, slug, collectionName, description, registeredCollections: [] },
  });

  ctx.body = platform;
  await next();
}
