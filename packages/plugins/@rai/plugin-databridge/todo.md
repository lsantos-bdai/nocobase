## TODO

- [-] change response type
  - [X] add collection_name
  - [ ] change relations to be more meaningful, should we add a new field after data
```json
{
  "data": {
    "platform": "models",
    "asset_name": "Golden",
    "collection": "FrankaResearch3",
    "data": {
      "createdAt": "2026-02-19T15:57:32.149Z",
      "updatedAt": "2026-02-19T15:57:38.147Z",
      "ethernet_ip": "10.103.1.101",
      "id": 14,
      "name": "Golden",
      "serial_number": "290102-1324356",
      "team": "Compose",
      "status": "Functional",
      "model": "Franka Research 3",
      "fw": "5.6",
      "f_emzum8x7g53": null,
      "f_nvu6tnxv3sh": 25,
      "f_8pplzus921u": null,
      "f_05n7tnnmx6h": 132
    }
  }
}
```
- [X] how should we deal with relations, I need an endpoint to get the schema of a collection in openapi format. Something like `"f_nvu6tnxv3sh": 25` is not very intuitive, it would be best to at least resolve this to the title of the collection it references. As for the id perhaps use `name` instead of `id` since it's enforced for platform creation anyways?
- [X] how should we expand relational data?


- [X] can we change `sync` to `manage` in the frontend.
- [X] when selecting collections to sync, I can't see existing collections that are already synced.
- [X] when syncing a database that has duplicate names as those that are already in the platform I only get a warning but no insight into why it went wrong. I shouldn't be allowed to attempt a sync of that collection if there are duplicates, this transaction should be atomic.
- [X] audit existing plugins for duplicate functions and implementations and opportunities to simplify

- [ ] when does the platform index get updated
  - [ ] when assets are added/removed from a collection
  - [ ] when new tables are added/removed from a collection
  - [ ] when the name of an asset gets changed in a collection


- [ ] openapi schemas need to be migratable

- [X] add proper documentation to all of the other collection endpoint
- [X] how are users supposed to use databridge_platforms Platform management what is `filterByTk`? If this is the id for the platform how do expect the user to get this using the api? `list` doesn't provide the id for the platform.
  - [X] shouldn't we expose all the functions for sync or just as a principal all functions we create in general
- [X] we should move `/databridge:listCollections` to `Platform management`


- [X] hide all t_

- [X] CRUD on assets?
- [X] query across assets properties
- [X] search assets in a platform
- [X] get rid of all default `spot_arm_v2`

- [-] can we create a plugin to manage collection audits and rollbacks like our own CDC implementation? So in this example if I deleted Station 1, I should be able to see when and who and have the ability to roll it back. This would also need some sort of snapshot behavior. Any idea how to implement something like this?
- [ ] I want another tab that shows all recent changes across all collections being tracked.


## Deliverable
- admin script:
  - import schemas via openapi spec
  - If I delete all tables and reimport them how do I configure the UI to be aware of the new table with the same schema but different name?
  - how do I update schemas programatically
