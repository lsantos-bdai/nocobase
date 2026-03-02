# Schema Management Plugin

Export NocoBase collections to OpenAPI specs and import OpenAPI specs to create collections.

## Features

- **Export**: Generate OpenAPI 3.0 YAML schemas from existing collections
- **Import**: Create collections and fields from OpenAPI YAML specs
- **Bidirectional**: Specs exported can be imported back (round-trip compatible)

---

## API Endpoints

### List Collections

```
GET /api/schema-management:listCollections
```

Returns collections available for export (filters out internal tables).

### Export Schema

```
GET /api/schema-management:generate?collection=MyCollection
```

Generates OpenAPI YAML for a collection. Accepts collection name or title.

### Import Schema

```
POST /api/schema-management:import
Content-Type: application/json

{ "spec": "openapi: 3.0.3\ninfo:\n  title: MyCollection\n..." }
```

Creates a collection and fields from an OpenAPI spec.

**Behavior:**
- Fails if collection already exists
- Fails if parent collections (inheritance) don't exist
- Fails if relation target collections don't exist
- Automatically adds preset fields (createdAt, updatedAt, createdBy, updatedBy)
- Uses transactions for atomicity

---

## OpenAPI ↔ NocoBase Type Mappings

### String Types

| OpenAPI | NocoBase |
|---------|----------|
| `type: string` | `string` |
| `type: string, format: text` | `text` |
| `type: string, format: email` | `string` + `interface: email` |
| `type: string, format: uri` | `string` + `interface: url` |
| `type: string, format: phone` | `string` + `interface: phone` |
| `type: string, format: password` | `password` |
| `type: string, format: uuid` | `uuid` |
| `type: string, format: date` | `date` |
| `type: string, format: date-time` | `date` + `interface: datetime` |
| `type: string, format: time` | `time` |
| `type: string, enum: [...]` | `string` + `interface: select` |

### Number Types

| OpenAPI | NocoBase |
|---------|----------|
| `type: integer` | `integer` |
| `type: integer, format: int64` | `bigInt` |
| `type: number` | `double` |
| `type: number, format: float` | `float` |
| `type: number, format: decimal` | `decimal` (requires `x-precision`, `x-scale`) |

### Other Types

| OpenAPI | NocoBase |
|---------|----------|
| `type: boolean` | `boolean` |
| `type: array` (with enum items) | `array` + `interface: multipleSelect` |
| `type: array` | `json` |
| `type: object` | `json` |

---

## NocoBase Extensions (x-*)

Use these extensions in your OpenAPI spec to access NocoBase-specific features:

### Relations

```yaml
properties:
  team:
    type: string
    x-belongs-to: Team           # belongsTo relation
  manager:
    type: string
    x-has-one: User              # hasOne relation
  members:
    type: array
    x-has-many: User             # hasMany relation
  tags:
    type: array
    x-belongs-to-many: Tag       # belongsToMany relation
```

### Special Field Types

```yaml
properties:
  content:
    type: string
    x-nocobase-type: richText    # Rich text editor
  notes:
    type: string
    x-nocobase-type: markdown    # Markdown editor
  progress:
    type: number
    x-nocobase-type: percent     # Percentage display
  theme:
    type: string
    x-nocobase-type: color       # Color picker
  avatar:
    type: string
    x-nocobase-type: icon        # Icon selector
  code:
    type: string
    x-nocobase-type: uid         # Unique ID generator
  data:
    type: object
    x-nocobase-type: jsonb       # JSONB storage
  order:
    type: integer
    x-nocobase-type: sort        # Sortable field
  computed:
    type: string
    x-nocobase-type: formula
    x-expression: "{{field1}} + {{field2}}"
```

### Field Constraints

```yaml
properties:
  email:
    type: string
    x-unique: true               # Unique constraint
  price:
    type: number
    format: decimal
    x-precision: 10              # Decimal precision
    x-scale: 2                   # Decimal scale
```

### Inheritance

```yaml
components:
  schemas:
    Robot:
      type: object
      x-inherits:
        - Asset                  # Inherit from Asset collection
      properties:
        serial_number:
          type: string
```

---

## Required Fields & Nullability

The `required` array controls `allowNull`:

```yaml
components:
  schemas:
    Product:
      type: object
      properties:
        name:
          type: string
        description:
          type: string
      required:
        - name    # name: allowNull = false
                  # description: allowNull = true (not in required)
```

---

## Validation Constraints

OpenAPI validation constraints are mapped to NocoBase JOI validation rules:

| OpenAPI | JOI Rule | Applies To |
|---------|----------|------------|
| `required: [field]` | `required` | All types |
| `minLength: N` | `min` | Strings |
| `maxLength: N` | `max` | Strings |
| `pattern: regex` | `pattern` | Strings |
| `minimum: N` | `min` | Numbers |
| `maximum: N` | `max` | Numbers |
| `exclusiveMinimum: N` | `greater` | Numbers |
| `exclusiveMaximum: N` | `less` | Numbers |
| `format: email` | `email` | Strings |
| `format: uuid` | `guid` | Strings |
| `format: uri` | `uri` | Strings |
| `minItems: N` | `min` | Arrays |
| `maxItems: N` | `max` | Arrays |

### Example

```yaml
properties:
  email:
    type: string
    format: email
    maxLength: 255
  code:
    type: string
    minLength: 3
    maxLength: 10
    pattern: "^[A-Z0-9]+$"
  quantity:
    type: integer
    minimum: 1
    maximum: 100
required:
  - email
  - code
```

This generates fields with validation that NocoBase enforces at the API level before database operations.

---

## Example Spec

```yaml
openapi: "3.0.3"
info:
  title: Robot
  version: "1.0.0"
components:
  schemas:
    Robot:
      type: object
      properties:
        name:
          type: string
        serial_number:
          description: Serial Number
          type: string
          x-unique: true
        status:
          description: Status
          type: string
          enum:
            - active
            - inactive
            - maintenance
        team:
          description: Team
          type: string
          x-belongs-to: Team
        ip_address:
          description: IP Address
          type: string
          format: uri
        last_seen:
          description: Last Seen
          type: string
          format: date-time
      required:
        - name
        - serial_number
```

This creates a collection with:
- `name` (string, required)
- `serial_number` (string, required, unique)
- `status` (select dropdown)
- `team` (belongsTo relation to Team collection)
- `ip_address` (URL field)
- `last_seen` (datetime field)
- Plus auto-generated: `id`, `createdAt`, `updatedAt`, `createdBy`, `updatedBy`

---

## UI Access

Navigate to **Settings → Schema Management**:

- **Export tab**: Select a collection and view/copy its OpenAPI schema
- **Import tab**: Paste an OpenAPI spec and click Import

---

## Limitations

- Single schema per spec (first schema in `components.schemas` is used)
- No batch import (import one collection at a time)
- Parent collections must exist before importing child collections
- Relation target collections must exist before importing
- Some advanced NocoBase features not yet supported:
  - Attachment fields
  - Sequence fields
