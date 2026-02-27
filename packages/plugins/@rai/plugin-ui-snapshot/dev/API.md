# UI Snapshot Plugin API

Lossless export and import of NocoBase UI pages. **One format** for both export and create.

## Endpoints

### Export Page

```bash
GET /api/ui-snapshot:export?path=EngOps/Workstations
```

Returns a `PageSnapshot` - complete FlowModel tree.

### Create Page

```bash
POST /api/ui-snapshot:create
Content-Type: application/json

# Body is the same PageSnapshot format from export
{
  "page": { "title": "Workstations", "route": "EngOps/Workstations" },
  "rootUid": "abc123",
  "flowModels": { ... },
  "collections": ["t_xxx"],
  "force": true  // optional - overwrite existing
}
```

UIDs are automatically remapped to avoid conflicts.

### Delete Page

```bash
POST /api/ui-snapshot:delete
Content-Type: application/json

{ "path": "EngOps/Workstations" }
```

### Export All Pages

```bash
GET /api/ui-snapshot:exportAll
```

## Round-Trip Workflow

```bash
# Export
curl "http://localhost:13000/api/ui-snapshot:export?path=EngOps/Workstations" \
  -H "Authorization: Bearer $TOKEN" > page.json

# Modify page.json if needed (change title, route, etc.)

# Import (creates new page with remapped UIDs)
curl -X POST "http://localhost:13000/api/ui-snapshot:create" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d @page.json
```

## Format: PageSnapshot

```json
{
  "page": {
    "title": "Page Title",
    "route": "Parent/PageName"
  },
  "rootUid": "uid_of_root_flowmodel",
  "flowModels": {
    "uid1": {
      "uid": "uid1",
      "use": "BlockGridModel",
      "stepParams": { ... },
      "subModels": { ... }
    },
    "uid2": { ... }
  },
  "collections": ["t_collection_name"]
}
```

The format is **lossless** - every FlowModel property is preserved exactly as stored in NocoBase.
