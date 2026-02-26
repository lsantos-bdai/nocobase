# UI Snapshot Plugin API Reference

The `@rai/plugin-ui-snapshot` plugin provides API endpoints for creating, exporting, and managing NocoBase UI pages using YAML configuration.

## API Endpoints

### Create Page from YAML

Creates a new UI page from YAML configuration.

```bash
POST /api/ui-snapshot:create
Content-Type: application/json
Authorization: Bearer $TOKEN
X-Role: root

{
  "yaml": "page:\n  title: ...",
  "force": false
}
```

**Parameters:**
- `yaml` (required): YAML configuration string
- `force` (optional): If `true`, deletes existing page first if it exists

**Response:**
```json
{
  "routeId": 123,
  "pageUid": "abc123xyz",
  "blocksCreated": 3,
  "path": "EngOps/Workstations"
}
```

**Status Codes:**
- `200`: Success
- `400`: Invalid request (missing yaml)
- `409`: Page already exists (use `force: true` to overwrite)
- `422`: YAML validation failed

---

### Delete Page

Deletes a UI page by its route path.

```bash
POST /api/ui-snapshot:delete
Content-Type: application/json
Authorization: Bearer $TOKEN
X-Role: root

{
  "path": "EngOps/Workstations"
}
```

**Parameters:**
- `path` (required): Route path of the page to delete

**Response:**
```json
{
  "deleted": true,
  "path": "EngOps/Workstations",
  "flowModelsDeleted": 15
}
```

**Status Codes:**
- `200`: Success
- `400`: Invalid request (missing path)
- `404`: Page not found

---

### Export Page to YAML

Exports a single UI page to YAML format.

```bash
GET /api/ui-snapshot:export?path=EngOps/Workstations
Authorization: Bearer $TOKEN
X-Role: root
```

**Query Parameters:**
- `path` (required): Route path of the page to export

**Response:**
```json
{
  "yaml": "page:\n  title: Workstations\n...",
  "path": "EngOps/Workstations"
}
```

**Status Codes:**
- `200`: Success
- `400`: Invalid request (missing path)
- `404`: Page not found

---

### Export All Pages

Exports the entire UI to a single YAML snapshot.

```bash
GET /api/ui-snapshot:exportAll
Authorization: Bearer $TOKEN
X-Role: root
```

**Response:**
```json
{
  "yaml": "version: '1.0'\nexported_at: '2026-02-26T14:30:00Z'\n...",
  "pageCount": 5
}
```

---

## YAML Configuration Format

### Basic Structure

```yaml
page:
  title: "Page Title"
  icon: "IconName"           # Optional - Ant Design icon name
  route: "Parent/PageName"   # Optional - auto-generated from title if omitted

collections:
  Alias: t_internal_name     # Maps aliases to internal collection names

layout:
  rows:
    - columns:
        - width: 15          # Column width out of 24
          blocks:
            - $ref: "#/blocks/block_name"
        - width: 9
          blocks:
            - $ref: "#/blocks/another_block"

blocks:
  block_name:
    type: TableBlockModel
    collection: Alias        # Uses alias from collections mapping
    # ... block-specific config
```

### Supported Block Types

#### TableBlockModel

```yaml
table_block:
  type: TableBlockModel
  collection: CollectionAlias
  columns:
    - field: name
      sortable: true
      width: 200
      fixed: left
    - field: status
      sortable: true
  actions:
    - type: filter
    - type: view
    - type: edit
    - type: delete
  pageSize: 20
  defaultSort:
    field: name
    order: asc
```

#### ChartBlockModel

```yaml
chart_block:
  type: ChartBlockModel
  collection: CollectionAlias
  chart:
    type: pie           # pie, bar, line, area, scatter, dualAxes
    dimension: field_x  # Category/X-axis field
    measure:
      field: id
      aggregation: count  # count, sum, avg, min, max
    options:
      legend: true
      tooltip: true
      labelType: percent  # percent, value, both, none
```

#### DetailsBlockModel

```yaml
details_block:
  type: DetailsBlockModel
  collection: CollectionAlias
  fields:
    - field: name
      span: 12          # Grid span out of 24
    - field: description
      span: 24
  actions:
    - type: edit
    - type: delete
```

#### FormBlockModel

```yaml
form_block:
  type: FormBlockModel
  collection: CollectionAlias
  fields:
    - field: name
      required: true
      placeholder: "Enter name..."
    - field: email
      required: true
  submitAction:
    label: "Save"
    successMessage: "Record saved successfully"
```

#### MarkdownBlockModel

```yaml
markdown_block:
  type: MarkdownBlockModel
  content: |
    # Heading

    Some **markdown** content.
```

---

## Usage Examples

### Create a Page

```bash
# Read YAML from file and create page
YAML_CONTENT=$(cat workstations.yaml)
curl -X POST http://localhost:13000/api/ui-snapshot:create \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Role: root" \
  -H "Content-Type: application/json" \
  -d "{\"yaml\": $(echo "$YAML_CONTENT" | jq -Rs .)}"
```

### Recreate Page After Collection Change

```bash
# 1. Update YAML config with new collection mapping
# collections:
#   WorkStation: t_new_internal_name

# 2. Recreate with force=true
curl -X POST http://localhost:13000/api/ui-snapshot:create \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Role: root" \
  -H "Content-Type: application/json" \
  -d '{"yaml": "...", "force": true}'
```

### Export and Backup

```bash
# Export single page
curl "http://localhost:13000/api/ui-snapshot:export?path=EngOps/Workstations" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Role: root" \
  | jq -r '.yaml' > workstations.yaml

# Export entire UI
curl "http://localhost:13000/api/ui-snapshot:exportAll" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Role: root" \
  | jq -r '.yaml' > ui-snapshot.yaml
```

---

## Layout System

The layout uses a **24-column grid system** similar to Bootstrap/Ant Design.

- Each row contains columns that should sum to 24 or less
- Each column can contain multiple blocks (stacked vertically)
- Block order within a column is preserved

**Example: Two-column layout (60%/40%)**

```yaml
layout:
  rows:
    - columns:
        - width: 14
          blocks:
            - $ref: "#/blocks/main_table"
        - width: 10
          blocks:
            - $ref: "#/blocks/chart_1"
            - $ref: "#/blocks/chart_2"
```

**Example: Three-column layout**

```yaml
layout:
  rows:
    - columns:
        - width: 8
          blocks:
            - $ref: "#/blocks/left_panel"
        - width: 8
          blocks:
            - $ref: "#/blocks/center_content"
        - width: 8
          blocks:
            - $ref: "#/blocks/right_panel"
```

---

## Collection Aliases

The `collections` mapping allows using friendly names in block definitions while maintaining a single source of truth for internal collection names.

When a collection is recreated (e.g., due to schema changes), only the mapping needs to be updated:

```yaml
# Before recreation
collections:
  WorkStation: t_old_abc123

# After recreation
collections:
  WorkStation: t_new_xyz789
```

All blocks referencing `WorkStation` will automatically use the new internal name.
