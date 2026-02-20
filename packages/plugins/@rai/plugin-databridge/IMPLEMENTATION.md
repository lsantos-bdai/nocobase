# Databridge Plugin - Low-Level Implementation Plan

## Current State

```
src/
├── server/
│   ├── plugin.ts          # Empty scaffold
│   └── index.ts
├── client/
│   ├── plugin.tsx         # Empty scaffold (has flowEngine.registerModels)
│   ├── index.tsx
│   ├── locale.ts
│   └── models/
│       └── index.ts
└── index.ts
```

## Target State

```
src/
├── server/
│   ├── plugin.ts              # Main server plugin with actions
│   ├── index.ts
│   ├── collections/
│   │   └── databridge-platforms.ts   # Directory collection
│   └── actions/
│       ├── lookup.ts          # databridge:lookup action
│       ├── create-platform.ts # databridge_platforms:create action
│       ├── sync-platform.ts   # databridge_platforms:sync action
│       └── index.ts           # Export all actions
├── client/
│   ├── plugin.tsx             # Register settings page
│   ├── index.tsx
│   ├── locale.ts
│   ├── models/
│   │   └── index.ts
│   └── components/
│       └── PlatformsManager.tsx  # Settings UI component
├── locale/
│   └── en-US.json             # Translations
└── index.ts
```

---

## Phase 1: Server Foundation

### Step 1.1: Create Directory Collection

**File:** `src/server/collections/databridge-platforms.ts`

```typescript
import { defineCollection } from '@nocobase/database';

export default defineCollection({
  name: 'databridge_platforms',
  title: 'Databridge Platforms',
  fields: [
    {
      type: 'string',
      name: 'name',
      unique: true,
      interface: 'input',
      uiSchema: { title: 'Name', required: true },
    },
    {
      type: 'string',
      name: 'slug',
      unique: true,
      interface: 'input',
      uiSchema: { title: 'Slug', required: true },
    },
    {
      type: 'string',
      name: 'collectionName',
      unique: true,
      interface: 'input',
      uiSchema: { title: 'Collection Name' },
    },
    {
      type: 'text',
      name: 'description',
      interface: 'textarea',
      uiSchema: { title: 'Description' },
    },
  ],
});
```

### Step 1.2: Create Lookup Action

**File:** `src/server/actions/lookup.ts`

```typescript
import { Context, Next } from '@nocobase/actions';

export async function lookup(ctx: Context, next: Next) {
  const { platform, asset_name } = ctx.request.query as {
    platform?: string;
    asset_name?: string;
  };

  if (!platform || !asset_name) {
    ctx.throw(400, 'platform and asset_name query parameters are required');
  }

  // 1. Get platform from directory
  const platformRecord = await ctx.db.getRepository('databridge_platforms').findOne({
    filter: { slug: platform },
  });

  if (!platformRecord) {
    ctx.throw(404, `Platform '${platform}' not found`);
  }

  // 2. Lookup asset in platform collection (O(1) - name is primary key)
  const lookupRepo = ctx.db.getRepository(platformRecord.collectionName);
  const lookup = await lookupRepo.findOne({
    filter: { name: asset_name },
  });

  if (!lookup) {
    ctx.throw(404, `Asset '${asset_name}' not found in platform '${platform}'`);
  }

  // 3. Fetch full asset from source collection (O(1) - id is primary key)
  const asset = await ctx.db.getRepository(lookup.collection).findOne({
    filterByTk: lookup.assetId,
  });

  if (!asset) {
    ctx.throw(404, `Asset record not found in collection '${lookup.collection}'`);
  }

  ctx.body = {
    platform,
    asset_name,
    collection: lookup.collection,
    data: asset,
  };

  await next();
}
```

### Step 1.3: Create Platform Action

**File:** `src/server/actions/create-platform.ts`

```typescript
import { Context, Next } from '@nocobase/actions';

export async function createPlatform(ctx: Context, next: Next) {
  const { name, slug, description } = ctx.action.params.values || {};

  if (!name || !slug) {
    ctx.throw(400, 'name and slug are required');
  }

  // Validate slug format (lowercase, alphanumeric, underscores)
  if (!/^[a-z][a-z0-9_]*$/.test(slug)) {
    ctx.throw(400, 'slug must start with lowercase letter and contain only lowercase letters, numbers, and underscores');
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
      hidden: true, // Hide from regular collection list
      autoGenId: false, // We use 'name' as the key
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
          name: 'assetId',
          interface: 'input',
          uiSchema: { title: 'Asset ID', required: true },
        },
      ],
    },
  });

  // 2. Sync database schema to create the table
  const collection = ctx.db.getCollection(collectionName);
  if (collection) {
    await collection.sync();
  }

  // 3. Register in directory
  const platform = await ctx.db.getRepository('databridge_platforms').create({
    values: { name, slug, collectionName, description },
  });

  ctx.body = platform;
  await next();
}
```

### Step 1.4: Sync Platform Action

**File:** `src/server/actions/sync-platform.ts`

```typescript
import { Context, Next } from '@nocobase/actions';

export async function syncPlatform(ctx: Context, next: Next) {
  const { filterByTk } = ctx.action.params;
  const { collections } = ctx.action.params.values || {};

  if (!filterByTk) {
    ctx.throw(400, 'filterByTk (platform id) is required');
  }

  if (!collections || !Array.isArray(collections) || collections.length === 0) {
    ctx.throw(400, 'collections array is required');
  }

  // Get platform from directory
  const platform = await ctx.db.getRepository('databridge_platforms').findOne({
    filterByTk,
  });

  if (!platform) {
    ctx.throw(404, 'Platform not found');
  }

  // Validate all collections exist and have 'name' field
  for (const collName of collections) {
    const coll = ctx.db.getCollection(collName);
    if (!coll) {
      ctx.throw(400, `Collection '${collName}' does not exist`);
    }
    if (!coll.getField('name')) {
      ctx.throw(400, `Collection '${collName}' must have a 'name' field`);
    }
  }

  const lookupRepo = ctx.db.getRepository(platform.collectionName);
  const errors: string[] = [];
  let synced = 0;

  // Clear existing entries
  await lookupRepo.destroy({ filter: {} });

  // Sync each collection
  for (const collName of collections) {
    const records = await ctx.db.getRepository(collName).find({
      fields: ['id', 'name'],
    });

    for (const record of records) {
      if (!record.name) continue;

      try {
        await lookupRepo.create({
          values: {
            name: record.name,
            collection: collName,
            assetId: String(record.id),
          },
        });
        synced++;
      } catch (err: any) {
        // Duplicate name - collect error but continue
        if (err.name === 'SequelizeUniqueConstraintError') {
          errors.push(`Duplicate asset name '${record.name}' from collection '${collName}'`);
        } else {
          throw err;
        }
      }
    }
  }

  ctx.body = {
    synced,
    errors: errors.length > 0 ? errors : undefined,
  };

  await next();
}
```

### Step 1.5: Delete Platform Action

**File:** `src/server/actions/destroy-platform.ts`

```typescript
import { Context, Next } from '@nocobase/actions';

export async function destroyPlatform(ctx: Context, next: Next) {
  const { filterByTk } = ctx.action.params;

  if (!filterByTk) {
    ctx.throw(400, 'filterByTk (platform id) is required');
  }

  // Get platform from directory
  const platform = await ctx.db.getRepository('databridge_platforms').findOne({
    filterByTk,
  });

  if (!platform) {
    ctx.throw(404, 'Platform not found');
  }

  // 1. Remove the platform collection
  await ctx.db.getRepository('collections').destroy({
    filter: { name: platform.collectionName },
  });

  // 2. Remove from directory
  await ctx.db.getRepository('databridge_platforms').destroy({ filterByTk });

  ctx.body = { success: true };
  await next();
}
```

### Step 1.6: Actions Index

**File:** `src/server/actions/index.ts`

```typescript
export { lookup } from './lookup';
export { createPlatform } from './create-platform';
export { syncPlatform } from './sync-platform';
export { destroyPlatform } from './destroy-platform';
```

### Step 1.7: Update Server Plugin

**File:** `src/server/plugin.ts`

```typescript
import { Plugin } from '@nocobase/server';
import { lookup, createPlatform, syncPlatform, destroyPlatform } from './actions';

export class PluginDatabridgeServer extends Plugin {
  async afterAdd() {}

  async beforeLoad() {}

  async load() {
    // Register databridge resource with lookup action
    this.app.resourceManager.define({
      name: 'databridge',
      actions: {
        lookup,
      },
    });

    // Register custom actions for databridge_platforms
    this.app.resourceManager.registerActionHandler(
      'databridge_platforms:create',
      createPlatform
    );
    this.app.resourceManager.registerActionHandler(
      'databridge_platforms:sync',
      syncPlatform
    );
    this.app.resourceManager.registerActionHandler(
      'databridge_platforms:destroy',
      destroyPlatform
    );

    // ACL permissions
    this.app.acl.registerSnippet({
      name: 'pm.databridge',
      actions: ['databridge_platforms:*', 'databridge:lookup'],
    });

    // Allow logged-in users to use lookup
    this.app.acl.allow('databridge', 'lookup', 'loggedIn');
  }

  async install() {}

  async afterEnable() {}

  async afterDisable() {}

  async remove() {}
}

export default PluginDatabridgeServer;
```

---

## Phase 2: Client Settings UI

### Step 2.1: Create PlatformsManager Component

**File:** `src/client/components/PlatformsManager.tsx`

```tsx
import React from 'react';
import {
  SchemaComponent,
  useAPIClient,
  useRequest,
} from '@nocobase/client';
import { Button, Table, Space, Modal, Form, Input, message } from 'antd';

const schema = {
  type: 'void',
  name: 'databridge-platforms',
  'x-component': 'div',
  properties: {
    actions: {
      type: 'void',
      'x-component': 'Space',
      'x-component-props': {
        style: { marginBottom: 16 },
      },
      properties: {
        create: {
          type: 'void',
          'x-component': 'CreatePlatformButton',
        },
      },
    },
    table: {
      type: 'void',
      'x-component': 'PlatformsTable',
    },
  },
};

function CreatePlatformButton() {
  const [open, setOpen] = React.useState(false);
  const [form] = Form.useForm();
  const api = useAPIClient();

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      await api.resource('databridge_platforms').create({ values });
      message.success('Platform created successfully');
      setOpen(false);
      form.resetFields();
      // Trigger table refresh
      window.dispatchEvent(new Event('databridge:refresh'));
    } catch (err: any) {
      message.error(err.message || 'Failed to create platform');
    }
  };

  return (
    <>
      <Button type="primary" onClick={() => setOpen(true)}>
        Create Platform
      </Button>
      <Modal
        title="Create Platform"
        open={open}
        onOk={handleCreate}
        onCancel={() => setOpen(false)}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input placeholder="e.g., Models" />
          </Form.Item>
          <Form.Item
            name="slug"
            label="Slug"
            rules={[
              { required: true },
              { pattern: /^[a-z][a-z0-9_]*$/, message: 'Must be lowercase with underscores' },
            ]}
          >
            <Input placeholder="e.g., models" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea placeholder="Optional description" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function PlatformsTable() {
  const api = useAPIClient();
  const { data, loading, refresh } = useRequest(() =>
    api.resource('databridge_platforms').list()
  );

  React.useEffect(() => {
    const handler = () => refresh();
    window.addEventListener('databridge:refresh', handler);
    return () => window.removeEventListener('databridge:refresh', handler);
  }, [refresh]);

  const handleDelete = async (id: number) => {
    Modal.confirm({
      title: 'Delete Platform',
      content: 'This will delete the platform and its lookup collection. Are you sure?',
      onOk: async () => {
        await api.resource('databridge_platforms').destroy({ filterByTk: id });
        message.success('Platform deleted');
        refresh();
      },
    });
  };

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Slug', dataIndex: 'slug', key: 'slug' },
    { title: 'Collection', dataIndex: 'collectionName', key: 'collectionName' },
    { title: 'Description', dataIndex: 'description', key: 'description' },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: any) => (
        <Space>
          <Button size="small" danger onClick={() => handleDelete(record.id)}>
            Delete
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Table
      rowKey="id"
      loading={loading}
      dataSource={data?.data || []}
      columns={columns}
    />
  );
}

export function PlatformsManager() {
  return (
    <SchemaComponent
      schema={schema}
      components={{ CreatePlatformButton, PlatformsTable }}
    />
  );
}
```

### Step 2.2: Update Client Plugin

**File:** `src/client/plugin.tsx`

```typescript
import { Plugin } from '@nocobase/client';
import { PlatformsManager } from './components/PlatformsManager';

export class PluginDatabridgeClient extends Plugin {
  async load() {
    // Register settings page
    this.app.pluginSettingsManager.add('databridge', {
      title: 'Databridge',
      icon: 'ApiOutlined',
      Component: PlatformsManager,
      aclSnippet: 'pm.databridge',
    });
  }
}

export default PluginDatabridgeClient;
```

### Step 2.3: Update Locale

**File:** `src/locale/en-US.json`

```json
{
  "Databridge": "Databridge",
  "Platforms": "Platforms",
  "Create Platform": "Create Platform",
  "Name": "Name",
  "Slug": "Slug",
  "Description": "Description",
  "Collection": "Collection",
  "Actions": "Actions",
  "Delete": "Delete",
  "Sync": "Sync"
}
```

---

## Verification Steps

### After Phase 1 (Server)

```bash
# 1. Enable the plugin
yarn pm enable @rai/plugin-databridge

# 2. Verify directory collection exists
curl http://localhost:13000/api/databridge_platforms:list

# 3. Create a platform
curl -X POST http://localhost:13000/api/databridge_platforms:create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"name":"Models","slug":"models","description":"All models"}'

# 4. Verify platform was created
curl http://localhost:13000/api/databridge_platforms:list

# 5. Sync collections to platform (assuming 'robots' collection exists with 'name' field)
curl -X POST "http://localhost:13000/api/databridge_platforms:sync?filterByTk=1" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"collections":["robots"]}'

# 6. Test lookup
curl "http://localhost:13000/api/databridge:lookup?platform=models&asset_name=<some-robot-name>"
```

### After Phase 2 (Client)

1. Login to NocoBase admin
2. Go to Settings (gear icon)
3. Find "Databridge" in the menu
4. Click "Create Platform"
5. Fill in name, slug, description
6. Verify platform appears in table
7. Delete platform and verify it's removed

---

## Files to Create

| File | Description |
|------|-------------|
| `src/server/collections/databridge-platforms.ts` | Directory collection definition |
| `src/server/actions/lookup.ts` | Lookup action |
| `src/server/actions/create-platform.ts` | Create platform action |
| `src/server/actions/sync-platform.ts` | Sync platform action |
| `src/server/actions/destroy-platform.ts` | Delete platform action |
| `src/server/actions/index.ts` | Actions barrel export |
| `src/client/components/PlatformsManager.tsx` | Settings UI component |
| `src/locale/en-US.json` | English translations |

## Files to Modify

| File | Changes |
|------|---------|
| `src/server/plugin.ts` | Register resources, actions, ACL |
| `src/client/plugin.tsx` | Register settings page |
