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
  - [ ] when assets are added/removed from a collection
  - [ ] when the name of an asset gets changed in a collection
  - [X] when new collections are added/removed from a platform (manual)


- [ ] openapi schemas need to be migratable
- [ ] collections were made using openapi spec and admin script, same spec needs to be generated via schama management

- [X] add proper documentation to all of the other collection endpoint
- [X] how are users supposed to use databridge_platforms Platform management what is `filterByTk`? If this is the id for the platform how do expect the user to get this using the api? `list` doesn't provide the id for the platform.
  - [X] shouldn't we expose all the functions for sync or just as a principal all functions we create in general
- [X] we should move `/databridge:listCollections` to `Platform management`


- [X] hide all t_

- [X] preview block not showing up properly
- [X] filter by changed fields
- [-] CRUD on assets?
  - [ ] test bad update
  - [ ] test single update
    - [ ] test rollback
  - [ ] test bulk update
    - [ ] test cascade rollback
  - [ ] test delete
    - [ ] test rollback
  - [ ] test create
    - [ ] test rollback
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
