# NocoBase Collection Schema → OpenAPI Spec Mapping

This document defines the exact mapping from NocoBase collection schemas and field types to OpenAPI 3.0 specifications.

## Purpose

Generate OpenAPI schemas from NocoBase collections that can validate databridge responses like:

```json
{
  "data": {
    "Golden": {
      "$schema": "https://storage.cloud.google.com/.../FrankaResearch3.yaml",
      "ethernet_ip": "10.103.1.101",
      "id": 14,
      "createdAt": "2026-02-19T15:57:32.149Z",
      "name": "Golden",
      "serial_number": "290102-1324356",
      "team": "Compose",
      "model": "Franka Research 3"
    }
  }
}
```

---

## Field Type Mappings

### Primitive Types

| NocoBase Type | OpenAPI Type | OpenAPI Format | Notes |
|---------------|--------------|----------------|-------|
| `string` | `string` | - | Use `maxLength` if `length` specified |
| `text` | `string` | - | Long text, no format |
| `integer` | `integer` | `int32` | |
| `bigInt` | `integer` | `int64` | |
| `float` | `number` | `float` | |
| `double` | `number` | `double` | |
| `real` | `number` | `float` | |
| `decimal` | `number` | - | Include precision/scale in description |
| `boolean` | `boolean` | - | |
| `radio` | `boolean` | - | Functionally boolean |

### Date/Time Types

| NocoBase Type | OpenAPI Type | OpenAPI Format | Notes |
|---------------|--------------|----------------|-------|
| `date` | `string` | `date-time` | ISO 8601 with time |
| `dateOnly` | `string` | `date` | ISO 8601 date only (YYYY-MM-DD) |
| `datetimeTz` | `string` | `date-time` | Timezone-aware |
| `datetimeNoTz` | `string` | `date-time` | No timezone |
| `time` | `string` | `time` | HH:MM:SS |
| `unixTimestamp` | `integer` | `int64` | Unix epoch seconds |

### Identifier Types

| NocoBase Type | OpenAPI Type | OpenAPI Format | Notes |
|---------------|--------------|----------------|-------|
| `uuid` | `string` | `uuid` | |
| `uid` | `string` | - | Pattern if `pattern` option set |
| `nanoid` | `string` | - | |
| `snowflakeId` | `string` | - | Large integer as string |

### Complex Types

| NocoBase Type | OpenAPI Type | OpenAPI Format | Notes |
|---------------|--------------|----------------|-------|
| `json` | `object` | - | `additionalProperties: true` |
| `jsonb` | `object` | - | `additionalProperties: true` |
| `array` | `array` | - | `items` based on `elementType` |
| `set` | `array` | - | `uniqueItems: true` |
| `blob` | `string` | `binary` | |
| `password` | `string` | `password` | |
| `virtual` | varies | - | Based on computed value type |

### Relation Types

| NocoBase Type | OpenAPI Representation | Notes |
|---------------|------------------------|-------|
| `belongsTo` | `string` | Returns related record's `name` field as string |
| `hasOne` | `string` | Returns related record's `name` field as string |
| `hasMany` | `array` of `string` | Returns array of related records' `name` fields |
| `belongsToMany` | `array` of `string` | Returns array of related records' `name` fields |

> **Note:** Databridge always resolves relations to their `name` field values - single relations become strings, multiple relations become arrays of strings. Nullable relations can be `null`.

---

## Field Options → OpenAPI Properties

### Nullability

```yaml
# NocoBase: allowNull: true (or field is nullable)
fieldName:
  type: string
  nullable: true

# NocoBase: allowNull: false
fieldName:
  type: string
  # nullable defaults to false
```

### Default Values

```yaml
# NocoBase: defaultValue: "active"
fieldName:
  type: string
  default: "active"
```

### Constraints

```yaml
# NocoBase: unique: true → description note only (not OpenAPI validation)
# NocoBase: primaryKey: true → description note only

# NocoBase: field.options.validation (if present) can inform:
fieldName:
  type: string
  minLength: 1
  maxLength: 255
  pattern: "^[a-z]+$"
```

### Enums (if field has enum/options)

```yaml
# NocoBase field with enum options
status:
  type: string
  enum:
    - active
    - inactive
    - pending
```

---

## Collection → OpenAPI Schema

### Basic Structure

Given a NocoBase collection `FrankaResearch3`:

```yaml
openapi: "3.0.3"
info:
  title: FrankaResearch3 Schema
  version: "1.0.0"
  description: Auto-generated from NocoBase collection

components:
  schemas:
    FrankaResearch3:
      type: object
      properties:
        id:
          type: integer
          format: int32
          description: Primary key
        createdAt:
          type: string
          format: date-time
        updatedAt:
          type: string
          format: date-time
        name:
          type: string
        # ... other fields
      required:
        - id
        - name
        # fields where allowNull: false
```

### Field Name Transformation

NocoBase internal field names (e.g., `f_nvu6tnxv3sh`) are transformed to human-readable names using the field's `title` option, normalized to snake_case:

- `field.options.title: "Franka Hand Gripper"` → `franka_hand_gripper`
- Fields without titles keep their original name

---

## Databridge Response Schema

The full databridge response wraps collection data:

```yaml
DataBridgeResponse:
  type: object
  properties:
    data:
      type: object
      additionalProperties:
        $ref: '#/components/schemas/FrankaResearch3'
```

Or for a single asset with `$schema` reference:

```yaml
AssetWithSchema:
  type: object
  properties:
    $schema:
      type: string
      format: uri
      description: URL to the OpenAPI schema for validation
  allOf:
    - $ref: '#/components/schemas/FrankaResearch3'
```

---

## Mapping Rules Summary

1. **Type mapping**: Use the table above to convert NocoBase field type → OpenAPI type/format
2. **Nullability**: Set `nullable: true` if `allowNull !== false`
3. **Required fields**: Fields with `allowNull: false` or `primaryKey: true` go in `required` array
4. **Relations**: Map to `string` (single) or `array` of `string` (multiple) - databridge resolves to names
5. **Field names**: Use normalized `title` if available, otherwise raw field name
6. **Auto fields**: Include `id`, `createdAt`, `updatedAt` if `autoGenId` is enabled

---

## Example Conversion

### NocoBase Collection Schema (conceptual)

```json
{
  "name": "t_abc123",
  "title": "FrankaResearch3",
  "fields": [
    { "name": "id", "type": "integer", "primaryKey": true, "autoIncrement": true },
    { "name": "createdAt", "type": "date" },
    { "name": "updatedAt", "type": "date" },
    { "name": "name", "type": "string", "allowNull": false },
    { "name": "f_serial", "type": "string", "title": "Serial Number" },
    { "name": "f_status", "type": "string", "title": "Status", "defaultValue": "active" },
    { "name": "f_team", "type": "belongsTo", "title": "Team", "target": "teams" },
    { "name": "f_grippers", "type": "hasMany", "title": "Grippers", "target": "grippers" }
  ]
}
```

### Generated OpenAPI Schema

```yaml
openapi: "3.0.3"
info:
  title: FrankaResearch3
  version: "1.0.0"

components:
  schemas:
    FrankaResearch3:
      type: object
      properties:
        id:
          type: integer
          format: int32
        createdAt:
          type: string
          format: date-time
        updatedAt:
          type: string
          format: date-time
        name:
          type: string
        serial_number:
          type: string
          nullable: true
        status:
          type: string
          default: "active"
          nullable: true
        team:
          type: string
          nullable: true
          description: "Related record name from teams collection"
        grippers:
          type: array
          items:
            type: string
          description: "Related record names from grippers collection"
      required:
        - id
        - name
```

---

## Implementation Notes

1. **Skip internal fields**: Fields starting with `f_` without a `title` should be skipped (auto-generated FK fields)
2. **Hidden fields**: Respect `hidden: true` option - exclude from schema
3. **Virtual fields**: Include if they have a clear type, otherwise skip
4. **Context fields**: Skip (server-side only)
5. **Password fields**: Skip or mark as writeOnly

---

## Verification

Test the generated schema validates actual databridge responses:

```bash
# Generate schema
curl "http://localhost:13000/api/schema-management:generate?collection=FrankaResearch3" > schema.yaml

# Get databridge response
curl "http://localhost:13000/api/databridge:lookup?platform=models&asset_name=Golden" > response.json

# Validate (using a JSON Schema validator)
# The response.data.Golden object should validate against FrankaResearch3 schema
```
