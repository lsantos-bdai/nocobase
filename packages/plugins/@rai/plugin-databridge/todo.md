## TODO

- [-] change response type
  - [X] add collection_name

- [X] how should we deal with relations, I need an endpoint to get the schema of a collection in openapi format. Something like `"f_nvu6tnxv3sh": 25` is not very intuitive, it would be best to at least resolve this to the title of the collection it references. As for the id perhaps use `name` instead of `id` since it's enforced for platform creation anyways?
- [X] how should we expand relational data?


- [X] can we change `sync` to `manage` in the frontend.
- [X] when selecting collections to sync, I can't see existing collections that are already synced.
- [X] when syncing a database that has duplicate names as those that are already in the platform I only get a warning but no insight into why it went wrong. I shouldn't be allowed to attempt a sync of that collection if there are duplicates, this transaction should be atomic.
- [X] audit existing plugins for duplicate functions and implementations and opportunities to simplify

- [-] when does the platform index get updated
  - [X] when assets are added/removed from a collection
  - [ ] when the name of an asset gets changed in a collection
  - [X] when new collections are added/removed from a platform (manual)

### what I want
- [ ] I want to delete our entire frontend user interface and remake it all using only code.
- [ ] I want to create the frontend how I want with no code and then from another plugin admin/setting panel save the state. This would then create a template for each block or something of the sort. I want to reuse as many existing features/infra as possible leveraging the existing template and routes features. There should be an additional config. This additional config would fill in the gaps like positioning (if easy), and block -> table routing for programatic updates.

- [ ] If I delete all tables and reimport them how do I configure the UI to be aware of the new table with the same schema but different name? All of the tables/pages/groups were created with no code and point directly to a specific table. Can this be modified programmatically?
- [ ] how do I update schemas programmatically, what if it's a breaking change? Are there enough tools such that I can create an admin script that will (1) create the new collection/table based off of an openapi spec (2) backfill data (3) update the gui to point to the new table. For 2, I'm okay with this being somewhat manual. (i.e export data as csv/json, update data accordingly to meet the new schema)

- [ ] reingest schemas but make name unique
- [ ] openapi schemas need to be migratable
- [ ] collections were made using openapi spec and admin script, same spec needs to be generated via schama management

- [X] add proper documentation to all of the other collection endpoint
- [X] how are users supposed to use databridge_platforms Platform management what is `filterByTk`? If this is the id for the platform how do expect the user to get this using the api? `list` doesn't provide the id for the platform.
  - [X] shouldn't we expose all the functions for sync or just as a principal all functions we create in general
- [X] we should move `/databridge:listCollections` to `Platform management`


- [X] hide all t_

- [X] preview block not showing up properly
- [X] filter by changed fields
- [X] all activity only updates on page refresh
- [X] changes made via api show user as unknown
- [X] databridge update endpoint doesn't need `platform`
- [X] add an `enable_all` button to turn audit on for all collections

- [X] test bad updates
  - [X] bad_invalid_enum.json
```json
{
  "error": "Validation failed",
  "details": {
    "asset": "",
    "message": "model: \"Intel RealSense D455\" is not a valid option in model field., status: \"Banana\" is not a valid option in status field."
  }
}
```
  - [X] bad_invalid_relation_one_to_many.json
```json
{
  "error": "Relation not found",
  "details": {
    "asset": "Station 3",
    "field": "left_realsense_cameras",
    "value": "IRS999999999",
    "message": "Asset 'IRS999999999' not found for field 'left_realsense_cameras'"
  }
}
```
  - [X] bad_invalid_relation_one_to_one.json
```json
{
  "error": "Relation not found",
  "details": {
    "asset": "Station 3",
    "field": "left_gpu",
    "value": "NONEXISTENT_WS",
    "message": "Asset 'NONEXISTENT_WS' not found for field 'left_gpu'"
  }
}
```
  - [X] bad_invalid_type.json
```json
{
  "error": "Validation failed",
  "details": {
    "asset": "",
    "message": "rt_throttling: Invalid number value: \"not a number\""
  }
}
```
  - [X] bad_missing_required_id.json
```json
{
  "errors": [
    {
      "message": "Asset 'Station 3': 'data.id' is required for this operation"
    }
  ]
}
```
  - [X] bad_missing_required_serial.json
```json
{
  "errors": [
    {
      "message": "IntelRealSense: serial_number is required"
    }
  ]
}
```
  - [X] bad_modified_system_data.json
```json
{
  "errors": [
    {
      "message": "Platform 'hacked' not found"
    }
  ]
}
```

- [X] CRUD on assets?
  - [X] test single update
    - [X] test rollback
  - [X] test bulk update
  - [X] test delete
    - [X] test rollback
  - [X] test create
    - [X] test rollback
- [X] query across assets properties
- [X] search assets in a platform
- [X] get rid of all default `spot_arm_v2`

- [X] can we create a plugin to manage collection audits and rollbacks like our own CDC implementation? So in this example if I deleted Station 1, I should be able to see when and who and have the ability to roll it back. This would also need some sort of snapshot behavior. Any idea how to implement something like this?
- [X] I want another tab that shows all recent changes across all collections being tracked.
- [X] I want a `edit` button for each selection so that I can modify `Retention (days)` and `Max Versions`

- [ ] linting for typescript and proper pre commit setup
- [ ] move everything over to data platform repo

## Deliverable
- admin script:
  - import schemas via openapi spec
  - If I delete all tables and reimport them how do I configure the UI to be aware of the new table with the same schema but different name?
  - how do I update schemas programmatically



## ui snapshot
- [X] sortable/quick edit for fields capture on export
- [X] action bar not captured
- [ ] position of fields is incorrect
- [ ] position of charts/tables/blocks are incorrect
