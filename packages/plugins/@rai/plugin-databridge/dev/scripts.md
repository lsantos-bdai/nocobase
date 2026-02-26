```bash
yarn pm disable @rai/plugin-databridge && docker exec proto-postgres-1 psql -U nocobase -d nocobase -c "DELETE FROM fields WHERE \"collectionName\" LIKE 'platform_%'; DELETE FROM collections WHERE name LIKE 'platform_%'; DROP TABLE IF EXISTS databridge_platforms, platform_models CASCADE;" && yarn pm enable @rai/plugin-databridge && docker exec proto-postgres-1 psql -U nocobase -d nocobase -c "\d databridge_platforms"
```
