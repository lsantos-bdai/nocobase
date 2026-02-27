# NocoBase UI Manipulation - Technical Reference

This document describes how to programmatically manipulate NocoBase UI components (pages, blocks, forms) via APIs. The primary use case is migrating collection references when schemas are recreated with new internal names.

## Architecture Overview

NocoBase uses a **three-layer architecture** for storing UI configuration:

```
desktopRoutes (menu/navigation)
    │
    └── schemaUid → uiSchemas (FlowRoute placeholder)
                        │
                        └── flowModels (actual page content)
                              │
                              └── stepParams.resourceSettings.init.collectionName
```

### Layer 1: desktopRoutes
- Stores menu items and page navigation
- Each route has a `schemaUid` linking to uiSchemas
- API: `GET /api/desktopRoutes?tree=true&sort=sort`

### Layer 2: uiSchemas
- Traditional NocoBase UI schema storage
- For pages, contains only a `FlowRoute` placeholder component
- Actual content delegated to flowModels
- API: `GET /api/uiSchemas:getJsonSchema/{uid}`

### Layer 3: flowModels (Primary Focus)
- Stores all page content: blocks, fields, actions, popups
- Collection references are deeply nested in `stepParams`
- Tree structure with parent-child relationships
- API: `GET /api/flowModels:findOne?uid={uid}`

## FlowModels API Endpoints

### List All FlowModels
```bash
GET /api/flowModels?pageSize=1000
```
Returns all flowModels with their `stepParams` (contains collection references).

### Get Single FlowModel
```bash
# By UID
GET /api/flowModels:findOne?uid={uid}

# By parent relationship
GET /api/flowModels:findOne?parentId={parentUid}&subKey={subKey}
```
Returns full model including nested `subModels`.

### Create/Update FlowModel
```bash
POST /api/flowModels:save
Content-Type: application/json

{
  "uid": "existing-uid-to-update",  // omit for new
  "use": "TableBlockModel",
  "stepParams": {
    "resourceSettings": {
      "init": {
        "dataSourceKey": "main",
        "collectionName": "t_new_collection_name"
      }
    }
  }
}
```

### Delete FlowModel
```bash
POST /api/flowModels:destroy?filterByTk={uid}
```

### Duplicate FlowModel (Deep Clone)
```bash
POST /api/flowModels:duplicate
Content-Type: application/json

{
  "uid": "source-uid"
}
```

### Move/Reorganize FlowModels
```bash
# Attach to new parent
POST /api/flowModels:attach
{
  "uid": "model-uid",
  "parentId": "new-parent-uid",
  "subKey": "items",
  "subType": "array",
  "position": "last"  // or "first", {"type": "before", "target": "uid"}
}

# Reorder siblings
POST /api/flowModels:move
{
  "sourceId": "model-to-move",
  "targetId": "reference-model",
  "position": "before"  // or "after"
}
```

## Creating Complete Pages via API (Verified)

This section documents the exact API sequence required to create a fully functional NocoBase page with blocks. This was verified by analyzing browser HAR files and testing directly against the API.

### Page Creation Architecture

A complete flowPage requires **4 components** created in this exact order:

```
desktopRoutes (flowPage + tabs child)
    │
    └── schemaUid → uiSchemas (FlowRoute placeholder)
                        │
                        ├── RootPageModel (parentId = schemaUid)
                        │
                        └── tabs child
                              │
                              └── BlockGridModel (parentId = tabs schemaUid!)
                                    │
                                    └── blocks (TableBlockModel, ChartBlockModel, etc.)
```

**Critical Insight:** The `BlockGridModel.parentId` must be the **tabs child's schemaUid**, NOT the page's schemaUid. This is what allows blocks to render correctly.

### Complete Page Creation Sequence

#### Step 1: Create Route (desktopRoutes:create)

```bash
curl -X POST "http://localhost:13000/api/desktopRoutes:create" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Role: root" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "flowPage",
    "title": "My New Page",
    "parentId": 348977622220800,
    "schemaUid": "mypage_schema_uid",
    "menuSchemaUid": "mypage_menu_uid",
    "enableTabs": false,
    "children": [{
      "type": "tabs",
      "schemaUid": "mypage_tabs_uid",
      "tabSchemaName": "mypage_tab_name",
      "hidden": true
    }]
  }'
```

**Key fields:**
- `parentId`: Route ID of parent (e.g., EngOps group = `348977622220800`)
- `schemaUid`: Unique ID for the page schema
- `menuSchemaUid`: Separate UID for menu entry (must differ from schemaUid)
- `enableTabs`: Set to `false` for single-tab pages
- `children[0].schemaUid`: **This is the tabs container UID - needed later for BlockGridModel!**
- `children[0].hidden`: Set to `true` to hide tab bar

#### Step 2: Insert uiSchema (uiSchemas:insert)

```bash
curl -X POST "http://localhost:13000/api/uiSchemas:insert" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Role: root" \
  -H "Content-Type: application/json" \
  -d '{"type":"void","x-component":"FlowRoute","x-uid":"mypage_schema_uid"}'
```

**Note:** The `x-uid` must match the route's `schemaUid` from Step 1.

#### Step 3: Create RootPageModel (flowModels:save)

```bash
curl -X POST "http://localhost:13000/api/flowModels:save" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Role: root" \
  -H "Content-Type: application/json" \
  -d '{
    "uid": "mypage_root_model_uid",
    "async": true,
    "parentId": "mypage_schema_uid",
    "subKey": "page",
    "subType": "object",
    "use": "RootPageModel",
    "stepParams": {},
    "sortIndex": 0,
    "flowRegistry": {}
  }'
```

**Key fields:**
- `parentId`: Must match the route's `schemaUid` from Step 1
- `subKey`: Must be `"page"`
- `subType`: Must be `"object"`
- `async`: Set to `true`

#### Step 4: Create BlockGridModel (flowModels:save)

```bash
curl -X POST "http://localhost:13000/api/flowModels:save" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Role: root" \
  -H "Content-Type: application/json" \
  -d '{
    "uid": "mypage_grid_uid",
    "parentId": "mypage_tabs_uid",
    "subKey": "grid",
    "async": true,
    "subType": "object",
    "use": "BlockGridModel",
    "stepParams": {},
    "sortIndex": 0,
    "flowRegistry": {},
    "filterManager": []
  }'
```

**CRITICAL:** The `parentId` must be the **tabs child's schemaUid** (`mypage_tabs_uid`), NOT the page's schemaUid!

### Adding Blocks to the Page

After creating the page, add blocks in 2 steps:

#### Step 1: Create the Block (e.g., TableBlockModel)

```bash
curl -X POST "http://localhost:13000/api/flowModels:save" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Role: root" \
  -H "Content-Type: application/json" \
  -d '{
    "uid": "mytable_uid",
    "use": "TableBlockModel",
    "parentId": "mypage_grid_uid",
    "subKey": "items",
    "subType": "array",
    "sortIndex": 1,
    "stepParams": {
      "resourceSettings": {
        "init": {
          "dataSourceKey": "main",
          "collectionName": "t_9dx8b5vb55b"
        }
      }
    },
    "flowRegistry": {}
  }'
```

#### Step 2: Update Grid Layout to Position the Block

```bash
curl -X POST "http://localhost:13000/api/flowModels:save" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Role: root" \
  -H "Content-Type: application/json" \
  -d '{
    "uid": "mypage_grid_uid",
    "stepParams": {
      "gridSettings": {
        "grid": {
          "rows": {
            "row1": [["mytable_uid"]]
          },
          "sizes": {
            "row1": [24]
          },
          "rowOrder": ["row1"]
        }
      }
    }
  }'
```

### Complete Working Example

This example creates a page under EngOps with a WorkStation table:

```bash
#!/bin/bash
TOKEN="your-jwt-token"
ENGOPS_PARENT_ID=348977622220800

# Generate unique IDs
TIMESTAMP=$(date +%s)
SCHEMA_UID="page_${TIMESTAMP}"
MENU_UID="menu_${TIMESTAMP}"
TABS_UID="tabs_${TIMESTAMP}"
TAB_NAME="tab_${TIMESTAMP}"
ROOT_UID="root_${TIMESTAMP}"
GRID_UID="grid_${TIMESTAMP}"
TABLE_UID="table_${TIMESTAMP}"
ROW_ID="row_${TIMESTAMP}"

# Step 1: Create Route
curl -s -X POST "http://localhost:13000/api/desktopRoutes:create" \
  -H "Authorization: Bearer $TOKEN" -H "X-Role: root" -H "Content-Type: application/json" \
  -d "{\"type\":\"flowPage\",\"title\":\"API Test Page\",\"parentId\":$ENGOPS_PARENT_ID,\"schemaUid\":\"$SCHEMA_UID\",\"menuSchemaUid\":\"$MENU_UID\",\"enableTabs\":false,\"children\":[{\"type\":\"tabs\",\"schemaUid\":\"$TABS_UID\",\"tabSchemaName\":\"$TAB_NAME\",\"hidden\":true}]}"

# Step 2: Insert uiSchema
curl -s -X POST "http://localhost:13000/api/uiSchemas:insert" \
  -H "Authorization: Bearer $TOKEN" -H "X-Role: root" -H "Content-Type: application/json" \
  -d "{\"type\":\"void\",\"x-component\":\"FlowRoute\",\"x-uid\":\"$SCHEMA_UID\"}"

# Step 3: Create RootPageModel
curl -s -X POST "http://localhost:13000/api/flowModels:save" \
  -H "Authorization: Bearer $TOKEN" -H "X-Role: root" -H "Content-Type: application/json" \
  -d "{\"uid\":\"$ROOT_UID\",\"async\":true,\"parentId\":\"$SCHEMA_UID\",\"subKey\":\"page\",\"subType\":\"object\",\"use\":\"RootPageModel\",\"stepParams\":{},\"sortIndex\":0,\"flowRegistry\":{}}"

# Step 4: Create BlockGridModel (parentId = TABS_UID!)
curl -s -X POST "http://localhost:13000/api/flowModels:save" \
  -H "Authorization: Bearer $TOKEN" -H "X-Role: root" -H "Content-Type: application/json" \
  -d "{\"uid\":\"$GRID_UID\",\"parentId\":\"$TABS_UID\",\"subKey\":\"grid\",\"async\":true,\"subType\":\"object\",\"use\":\"BlockGridModel\",\"stepParams\":{},\"sortIndex\":0,\"flowRegistry\":{},\"filterManager\":[]}"

# Step 5: Create TableBlockModel
curl -s -X POST "http://localhost:13000/api/flowModels:save" \
  -H "Authorization: Bearer $TOKEN" -H "X-Role: root" -H "Content-Type: application/json" \
  -d "{\"uid\":\"$TABLE_UID\",\"use\":\"TableBlockModel\",\"parentId\":\"$GRID_UID\",\"subKey\":\"items\",\"subType\":\"array\",\"sortIndex\":1,\"stepParams\":{\"resourceSettings\":{\"init\":{\"dataSourceKey\":\"main\",\"collectionName\":\"t_9dx8b5vb55b\"}}},\"flowRegistry\":{}}"

# Step 6: Update grid layout
curl -s -X POST "http://localhost:13000/api/flowModels:save" \
  -H "Authorization: Bearer $TOKEN" -H "X-Role: root" -H "Content-Type: application/json" \
  -d "{\"uid\":\"$GRID_UID\",\"stepParams\":{\"gridSettings\":{\"grid\":{\"rows\":{\"$ROW_ID\":[[\"$TABLE_UID\"]]},\"sizes\":{\"$ROW_ID\":[24]},\"rowOrder\":[\"$ROW_ID\"]}}}}"

echo "Page created at: http://localhost:13000/admin/$SCHEMA_UID"
```

### Common Pitfalls

| Issue | Cause | Solution |
|-------|-------|----------|
| Page shows blank | BlockGridModel.parentId wrong | Use tabs schemaUid, not page schemaUid |
| Can't add blocks via GUI | Missing BlockGridModel | Ensure Step 4 completed successfully |
| Blocks don't appear | Grid layout not updated | Run Step 6 to position blocks in grid |
| Page not in menu | Route not created properly | Check parentId and schemaUid in Step 1 |

---

## Creating Blocks Programmatically (Verified)

### Critical: Parent Relationship Must Be in Initial Save

When creating a child flowModel (e.g., a chart inside a BlockGridModel), you **MUST include `parentId`, `subKey`, and `subType` in the initial save call**. This establishes the tree path (closure table) entries correctly.

**Wrong approach (tree path not created):**
```typescript
// Step 1: Create standalone
await api.post('/flowModels:save', { uid: 'chart1', use: 'ChartBlockModel', stepParams: {...} });
// Step 2: Try to attach later - DOESN'T WORK PROPERLY
await api.post('/flowModels:save', { uid: 'chart1', parentId: 'grid1', subKey: 'items' });
```

**Correct approach (tree path created automatically):**
```typescript
await api.post('/flowModels:save', {
  uid: 'chart1',
  use: 'ChartBlockModel',
  parentId: 'grid1',        // Include from start!
  subKey: 'items',          // Where in parent's subModels
  subType: 'array',         // "array" or "object"
  sortIndex: 4,             // Order among siblings
  stepParams: { ... },      // Block configuration
  flowRegistry: {}
});
```

### Grid Layout System

Block positioning is controlled by `BlockGridModel.stepParams.gridSettings.grid`:

```json
{
  "gridSettings": {
    "grid": {
      "rows": {
        "row_id_1": [
          ["block_uid_1"],                    // Column 1: single block
          ["block_uid_2", "block_uid_3"]      // Column 2: two blocks stacked
        ]
      },
      "sizes": {
        "row_id_1": [15, 9]                   // Column widths (out of 24)
      },
      "rowOrder": ["row_id_1"]                // Vertical row ordering
    }
  }
}
```

**Layout rules:**
- Uses a **24-column grid** (like Bootstrap)
- `rows`: Maps row ID → array of columns, each column contains block UIDs (vertically stacked)
- `sizes`: Column widths as fractions of 24 (e.g., `[15, 9]` = 62.5% + 37.5%)
- `rowOrder`: Controls vertical ordering of rows

### Complete Example: Add a Chart to Existing Page

```typescript
const TOKEN = 'your-jwt-token';
const PARENT_GRID_UID = '3ddd079e65b';  // BlockGridModel uid
const COLLECTION = 't_9dx8b5vb55b';     // WorkStation

// Step 1: Create chart with parent relationship
const chartUid = `chart_${Date.now()}`;
await fetch('http://localhost:13000/api/flowModels:save', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${TOKEN}`,
    'X-Role': 'root',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    uid: chartUid,
    use: 'ChartBlockModel',
    parentId: PARENT_GRID_UID,
    subKey: 'items',
    subType: 'array',
    sortIndex: 5,
    stepParams: {
      chartSettings: {
        configure: {
          query: {
            collectionPath: ['main', COLLECTION],
            measures: [{ field: ['id'], aggregation: 'count' }],
            dimensions: [{ field: ['team'] }],
            orders: [],
            mode: 'builder'
          },
          chart: {
            option: {
              mode: 'basic',
              builder: {
                type: 'bar',
                xField: 'team',
                yField: 'id',
                legend: true,
                tooltip: true
              }
            }
          }
        }
      }
    },
    flowRegistry: {}
  })
});

// Step 2: Update grid layout to position the chart
// First, get current grid layout
const gridResponse = await fetch(`http://localhost:13000/api/flowModels:findOne?uid=${PARENT_GRID_UID}`, {
  headers: { 'Authorization': `Bearer ${TOKEN}`, 'X-Role': 'root' }
});
const gridData = await gridResponse.json();
const currentGrid = gridData.data.stepParams.gridSettings.grid;

// Add new chart to column 2 (index 1)
const rowId = currentGrid.rowOrder[0];
currentGrid.rows[rowId][1].push(chartUid);

// Save updated layout
await fetch('http://localhost:13000/api/flowModels:save', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${TOKEN}`,
    'X-Role': 'root',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    uid: PARENT_GRID_UID,
    stepParams: { gridSettings: { grid: currentGrid } }
  })
});

console.log(`Chart ${chartUid} created and positioned!`);
```

### Tree Path Verification

To verify the tree path was created correctly:
```sql
SELECT ancestor, descendant, depth
FROM "flowModelTreePath"
WHERE descendant = 'your_chart_uid'
ORDER BY depth;
```

Expected result for a properly created child:
```
ancestor        | descendant     | depth
----------------+----------------+-------
your_chart_uid  | your_chart_uid |     0   -- Self reference
parent_grid_uid | your_chart_uid |     1   -- Direct parent
page_root_uid   | your_chart_uid |     2   -- Grandparent (page)
```

### FlowModel Types for Blocks

| use | Description | Parent subKey |
|-----|-------------|---------------|
| `ChartBlockModel` | Chart visualization | `items` |
| `TableBlockModel` | Data table | `items` |
| `DetailsBlockModel` | Record details view | `items` |
| `FormBlockModel` | Input form | `items` |
| `MarkdownBlockModel` | Markdown content | `items` |
| `TableColumnModel` | Table column | `columns` |
| `FormItemModel` | Form field | `items` |
| `FilterActionModel` | Filter button | `actions` |

## Collection Reference Locations

Collection names appear in multiple `stepParams` paths:

### Block Data Source
```json
{
  "stepParams": {
    "resourceSettings": {
      "init": {
        "dataSourceKey": "main",
        "collectionName": "t_98x374ie2j7"
      }
    }
  }
}
```

### Field Bindings
```json
{
  "stepParams": {
    "fieldSettings": {
      "init": {
        "dataSourceKey": "main",
        "collectionName": "t_98x374ie2j7",
        "fieldPath": "name"
      }
    }
  }
}
```

### Popup/Drawer Targets
```json
{
  "stepParams": {
    "popupSettings": {
      "openView": {
        "collectionName": "t_xs3ll5sl6w2",
        "associationName": "t_98x374ie2j7.left_gello",
        "dataSourceKey": "main"
      }
    }
  }
}
```

## Querying Collection References

### Find All FlowModels Referencing a Collection
```bash
# Get all flowModels
curl -s "http://localhost:13000/api/flowModels?pageSize=1000" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Role: root" > all_flows.json

# Filter with jq for specific collection
jq '[.data[] | select(.stepParams | tostring | contains("t_98x374ie2j7"))]' all_flows.json
```

### Count References Per Collection
```bash
jq -r '[.data[] | .. | .collectionName? // empty] | group_by(.) | map({collection: .[0], count: length}) | sort_by(-.count)' all_flows.json
```

## Migration Strategy

### Step 1: Build Collection Name Mapping
```typescript
// Map old internal names to new ones using titles
const mapping: Record<string, string> = {
  "t_old_abc123": "t_new_xyz789",  // ArmStation
  "t_old_def456": "t_new_uvw012",  // WorkStation
};
```

### Step 2: Query All Affected FlowModels
```typescript
const response = await fetch('/api/flowModels?pageSize=2000', {
  headers: { Authorization: `Bearer ${token}`, 'X-Role': 'root' }
});
const { data: allModels } = await response.json();

// Filter models that reference old collections
const affectedModels = allModels.filter(model => {
  const json = JSON.stringify(model.stepParams);
  return Object.keys(mapping).some(oldName => json.includes(oldName));
});
```

### Step 3: Update Each Model
```typescript
function replaceCollectionRefs(obj: any, mapping: Record<string, string>): any {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(item => replaceCollectionRefs(item, mapping));

  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'collectionName' && typeof value === 'string' && mapping[value]) {
      result[key] = mapping[value];
    } else if (key === 'associationName' && typeof value === 'string') {
      // Handle "collection.field" format
      const [coll, field] = value.split('.');
      result[key] = mapping[coll] ? `${mapping[coll]}.${field}` : value;
    } else {
      result[key] = replaceCollectionRefs(value, mapping);
    }
  }
  return result;
}

// Update each affected model
for (const model of affectedModels) {
  const updatedStepParams = replaceCollectionRefs(model.stepParams, mapping);

  await fetch('/api/flowModels:save', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Role': 'root',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      uid: model.uid,
      stepParams: updatedStepParams
    })
  });
}
```

## FlowModel Types Reference

Common `use` values and their purposes:

| use | Description |
|-----|-------------|
| `RootPageModel` | Page root container |
| `BlockGridModel` | Grid layout for blocks |
| `TableBlockModel` | Table/list view block |
| `FormBlockModel` | Form block |
| `DetailsBlockModel` | Details/read-only view |
| `ChartBlockModel` | Chart visualization (pie, bar, line, etc.) |
| `TableColumnModel` | Table column configuration |
| `TableActionsColumnModel` | Actions column in table |
| `FormItemModel` | Form field item |
| `DetailsItemModel` | Details field item |
| `FilterActionModel` | Filter button/panel |
| `ViewActionModel` | View/open action |
| `EditActionModel` | Edit action |
| `DeleteActionModel` | Delete action |
| `CreateActionModel` | Create/add action |
| `DisplayTextFieldModel` | Text display field |
| `ChildPageTabModel` | Tab in popup/drawer |

## Database Schema

### flowModels Table
```sql
CREATE TABLE flowModels (
  uid VARCHAR PRIMARY KEY,
  name VARCHAR,
  use VARCHAR,           -- Model type (e.g., "TableBlockModel")
  stepParams JSONB,      -- Configuration including collection refs
  parentId VARCHAR,      -- Parent model UID
  subKey VARCHAR,        -- Relationship key (e.g., "items", "columns")
  subType VARCHAR,       -- "array" or "object"
  sortIndex INTEGER,     -- Order within siblings
  flowRegistry JSONB,
  -- ... other fields
);
```

### flowModelTreePath Table (Closure Table)
```sql
CREATE TABLE flowModelTreePath (
  ancestor VARCHAR,
  descendant VARCHAR,
  depth INTEGER
);

-- Find all descendants of a page
SELECT fm.* FROM flowModels fm
JOIN flowModelTreePath tp ON fm.uid = tp.descendant
WHERE tp.ancestor = 'page-root-uid';
```

## Example: Complete Migration Script

```typescript
import axios from 'axios';

const NOCOBASE_URL = 'http://localhost:13000';
const TOKEN = 'your-jwt-token';

const client = axios.create({
  baseURL: `${NOCOBASE_URL}/api`,
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    'X-Role': 'root'
  }
});

async function migrateCollectionReferences(mapping: Record<string, string>) {
  // 1. Fetch all flowModels
  const { data: { data: allModels } } = await client.get('/flowModels?pageSize=2000');

  console.log(`Found ${allModels.length} total flowModels`);

  // 2. Find affected models
  const oldNames = Object.keys(mapping);
  const affected = allModels.filter((m: any) => {
    const json = JSON.stringify(m.stepParams || {});
    return oldNames.some(name => json.includes(name));
  });

  console.log(`Found ${affected.length} models with collection references to migrate`);

  // 3. Update each model
  let updated = 0;
  for (const model of affected) {
    const newStepParams = replaceCollectionRefs(model.stepParams, mapping);

    try {
      await client.post('/flowModels:save', {
        uid: model.uid,
        stepParams: newStepParams
      });
      updated++;
      console.log(`Updated ${model.uid} (${model.use})`);
    } catch (err: any) {
      console.error(`Failed to update ${model.uid}:`, err.response?.data || err.message);
    }
  }

  console.log(`Migration complete: ${updated}/${affected.length} models updated`);
}

function replaceCollectionRefs(obj: any, mapping: Record<string, string>): any {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(item => replaceCollectionRefs(item, mapping));

  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'collectionName' && typeof value === 'string' && mapping[value]) {
      result[key] = mapping[value];
    } else if (key === 'associationName' && typeof value === 'string') {
      const [coll, ...rest] = value.split('.');
      result[key] = mapping[coll] ? [mapping[coll], ...rest].join('.') : value;
    } else {
      result[key] = replaceCollectionRefs(value, mapping);
    }
  }
  return result;
}

// Usage
migrateCollectionReferences({
  't_old_armstation': 't_new_armstation',
  't_old_workstation': 't_new_workstation'
});
```

## Current State (as of investigation)

### Collections in Use
| Internal Name | Title | UI References |
|--------------|-------|---------------|
| `t_9dx8b5vb55b` | WorkStation | 105 |
| `t_ta7jaqy245a` | FrankaResearch3 | 52 |
| `t_zldxcwpdr9g` | IntelRealSense | 30 |
| `t_uetjo7qm3rj` | ForceTorqueSensor | 27 |
| `t_twnzhnb4zpx` | Robotiq | 25 |
| `t_xs3ll5sl6w2` | LeaderArmTeleopDevice | 19 |
| `t_98x374ie2j7` | ArmStation | 18 |
| `t_ia6xdhl47vf` | ShunkGripper | 10 |
| `t_3kd9p7z6chd` | FrankaHand | 4 |

### Pages Structure
```
EngOps (group)
├── Arm Station (flowPage) → t_98x374ie2j7
├── Workstations (flowPage) → t_9dx8b5vb55b
├── Sensors (group)
│   ├── RealSense (flowPage) → t_zldxcwpdr9g
│   └── Force Torque Sensors (flowPage) → t_uetjo7qm3rj
├── Grippers (group)
│   ├── Franka Hand Grippers (flowPage) → t_3kd9p7z6chd
│   └── Robotiq (flowPage) → t_twnzhnb4zpx
└── Robots (group)
    └── Franka3 Arms (flowPage) → t_ta7jaqy245a
```

## Key Insights

1. **FlowModels are the source of truth** for page content, not uiSchemas
2. **Collection references are deeply nested** in `stepParams` JSON
3. **Multiple reference types exist**: block data sources, field bindings, popup targets, association paths
4. **Full CRUD API available**: list, findOne, save, destroy, duplicate, attach, move
5. **No server restart needed** after API updates - changes are immediate
6. **Tree structure** allows querying all descendants of a page

## Template System

NocoBase has **multiple template systems**. The primary one for flowModels-based pages is `flowModelTemplates`.

### Template Storage: flowModelTemplates

Templates are stored in the `flowModelTemplates` collection (not `blockTemplates`).

```bash
GET /api/flowModelTemplates:list?sort=-createdAt&pageSize=50
```

### Template Structure

```json
{
  "uid": "ikpubxo580w",
  "name": "Details: ArmStation > Robot Left Arm (FrankaResearch3)",
  "description": "",
  "targetUid": "33586d0012f",           // References flowModel uid
  "useModel": "DetailsBlockModel",       // Block type
  "type": "block",
  "dataSourceKey": "main",
  "collectionName": "t_ta7jaqy245a",     // Collection binding
  "associationName": "t_98x374ie2j7.robot_left_arm",  // Association path
  "filterByTk": "{{ctx.view.inputArgs.filterByTk}}",
  "sourceId": "{{ctx.view.inputArgs.sourceId}}",
  "usageCount": 2
}
```

### Key Template Fields

| Field | Description |
|-------|-------------|
| `uid` | Template unique identifier |
| `name` | Display name |
| `targetUid` | Links to actual flowModel containing the block config |
| `useModel` | Block model type (TableBlockModel, DetailsBlockModel, etc.) |
| `collectionName` | Collection this template is bound to |
| `associationName` | For relationship blocks: `parentCollection.fieldName` |
| `usageCount` | How many instances use this template |

### Template API Endpoints (Verified)

```bash
# List templates
GET /api/flowModelTemplates:list?sort=-createdAt&pageSize=50

# Get single template
GET /api/flowModelTemplates:get?filterByTk={uid}

# Create template (requires targetUid linking to existing flowModel)
POST /api/flowModelTemplates:create
Content-Type: application/json

{
  "name": "My Template",
  "description": "Optional description",
  "targetUid": "existing-flowmodel-uid",  // REQUIRED
  "useModel": "DetailsBlockModel",
  "type": "block",
  "dataSourceKey": "main",
  "collectionName": "t_xxx",
  "associationName": "t_parent.field_name"  // optional for relationships
}

# Update template
POST /api/flowModelTemplates:update?filterByTk={uid}
Content-Type: application/json

{
  "description": "Updated description",
  "collectionName": "t_new_collection"
}

# Delete template
POST /api/flowModelTemplates:destroy?filterByTk={uid}
# Returns: {"data": 1} on success
```

**Note:** Unlike `flowModels` which has a `:save` endpoint for upsert, `flowModelTemplates` uses standard `:create`/`:update` separately.

### Collection References in Templates

Templates store collection references in multiple places:

1. **`collectionName`** - Direct collection binding
2. **`associationName`** - Association path (format: `collection.field`)
3. **`targetUid`** → flowModel → `stepParams` - Nested in the actual block config

### Current Templates (as of investigation)

| Template Name | Collection | Model | Usage |
|--------------|------------|-------|-------|
| Details: ArmStation > Robot Left Arm | t_ta7jaqy245a | DetailsBlockModel | 2 |
| Details: ArmStation > Right Rt | t_9dx8b5vb55b | DetailsBlockModel | 2 |
| Details: FrankaResearch3 > Force Torque Sensor | t_uetjo7qm3rj | DetailsBlockModel | 3 |
| Details: FrankaResearch3 > Franka Hand Gripper | t_3kd9p7z6chd | DetailsBlockModel | 3 |
| Details: WorkStation | t_9dx8b5vb55b | DetailsBlockModel | 2 |
| Details: ArmStation | t_98x374ie2j7 | DetailsBlockModel | 1 |
| Table: IntelRealSense | t_ai74wbokk2u | TableBlockModel | 1 |

### Migration Implications

When migrating collection names, you must update:

1. **flowModels** - Block configurations (stepParams and nested subModels)
2. **flowModelTemplates** - Template metadata records (collectionName, associationName)
3. **Linked flowModels** - The actual block config referenced by template's `targetUid`

```typescript
// Complete template migration - both metadata and linked flowModels
async function migrateTemplates(mapping: Record<string, string>) {
  const { data } = await client.get('/flowModelTemplates:list?paginate=false');
  const templates = data.data;

  console.log(`Found ${templates.length} templates to check`);

  for (const template of templates) {
    // 1. Update template metadata (collectionName, associationName)
    const metadataUpdates: any = {};

    if (mapping[template.collectionName]) {
      metadataUpdates.collectionName = mapping[template.collectionName];
    }

    if (template.associationName) {
      const [coll, ...rest] = template.associationName.split('.');
      if (mapping[coll]) {
        metadataUpdates.associationName = [mapping[coll], ...rest].join('.');
      }
    }

    if (Object.keys(metadataUpdates).length > 0) {
      await client.post(`/flowModelTemplates:update?filterByTk=${template.uid}`, metadataUpdates);
      console.log(`Updated template metadata: ${template.name}`);
    }

    // 2. Update linked flowModel (targetUid) - contains actual block config
    if (template.targetUid) {
      const { data: flowModelData } = await client.get(`/flowModels:findOne?uid=${template.targetUid}`);
      const flowModel = flowModelData.data;

      if (flowModel) {
        const json = JSON.stringify(flowModel.stepParams || {});
        const needsUpdate = Object.keys(mapping).some(old => json.includes(old));

        if (needsUpdate) {
          const updatedStepParams = replaceCollectionRefs(flowModel.stepParams, mapping);
          await client.post('/flowModels:save', {
            uid: flowModel.uid,
            stepParams: updatedStepParams
          });
          console.log(`Updated linked flowModel: ${flowModel.uid}`);
        }
      }
    }
  }
}
```

### Template Inheritance

Templates use a **reference-based inheritance** system:
- `targetUid` points to the actual flowModel with block configuration
- Instances reference the template but can have local overrides
- Changes to the template flowModel propagate to all instances

### Template-FlowModel Relationship (Verified)

When you fetch a template's linked flowModel via `targetUid`, you get the **full nested structure** with all subModels:

```
Template (flowModelTemplates)
  └── targetUid: "33586d0012f"
        │
        └── FlowModel (flowModels)
              ├── use: "DetailsBlockModel"
              ├── stepParams.resourceSettings.init.collectionName
              └── subModels:
                    ├── actions[] (EditActionModel, LinkActionModel)
                    └── grid (DetailsGridModel)
                          └── items[] (DetailsItemModel)
                                └── field (DisplayTextFieldModel)
                                      └── stepParams.popupSettings.openView.collectionName
```

**Collection references exist at multiple depths** in the linked flowModel:
1. Root level: `stepParams.resourceSettings.init.collectionName`
2. Action level: `subModels.actions[].stepParams.popupSettings.openView.collectionName`
3. Field level: `subModels.grid.subModels.items[].stepParams.fieldSettings.init.collectionName`
4. Nested field level: `subModels.grid.subModels.items[].subModels.field.stepParams.popupSettings.openView.collectionName`

**Migration must update both:**
1. The `flowModelTemplates` record (collectionName, associationName fields)
2. The linked `flowModels` record and all its nested subModels

### Other Template Collections (Less Common)

| Collection | Purpose |
|------------|---------|
| `blockTemplates` | Legacy block templates (uiSchemas-based) |
| `uiSchemaTemplates` | Low-level UI schema templates |
| `blockTemplateLinks` | Links between blockTemplates and instances |

For flowModels-based pages (the current system), `flowModelTemplates` is the primary template storage.

## Related Files

- OpenAPI specs: `/proto/scripts/openapi/`
- Migration scripts: `/proto/scripts/migrate.ts`
- CSV ingestion: `/proto/scripts/ingest-csv.ts`
- Dev scripts: `/packages/plugins/@rai/plugin-databridge/dev/scripts.md`
