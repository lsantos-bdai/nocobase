# @rai/plugin-dashboard

A NocoBase plugin that provides a BigQuery-backed analytics dashboard with per-team views, custom widgets, and an admin panel for configuring team → collector mappings.

---

## What it does

### Overall analytics (`/admin/page-analytics`)
- Filter bar: date range + multi-collector select
- Built-in charts: session timeline, collector breakdown, data-type pie, recent sessions table
- Custom widget canvas (`team = "overall"`) for org-wide notes and charts

### Team dashboards
Expandable sidebar groups — one per team. Each group contains:
- **Overview**: filter bar scoped to the team's assigned collectors, built-in charts, custom widget canvas
- **Custom Widgets**: a dedicated full-page widget canvas scoped to that team
- **User-created pages**: markdown content block + per-page widget canvas

Each team page supports:
- Title editing (inline click-to-edit)
- Markdown content block (saved to DB)
- Widget canvas: stat cards, line/bar/pie charts, tables, and markdown widgets
- Drag-to-reorder widgets
- Add / edit / delete widgets

### Widget types
| Type | Description |
|---|---|
| `stat` | Single aggregated value |
| `timeseries` | Line chart (date × value) |
| `breakdown` | Bar chart (category × value) |
| `pie` | Donut pie chart |
| `table` | Paginated row data |
| `markdown` | Freeform text / notes (no SQL) |

### Admin settings (`Settings → Page Analytics`)
Assign BigQuery collector IDs to teams. When collectors are assigned, the team dashboard pre-filters all charts and the filter bar to only show data from those collectors.

---

## Architecture

```
src/
├── client/
│   ├── plugin.tsx              # Route + settings registration
│   ├── types.ts                # Widget / WidgetType
│   ├── AnalyticsPage.tsx       # Sidebar + page router
│   ├── analytics/              # Overall dashboard + filter bar
│   ├── team/                   # TeamDashboard, TeamPage, TeamWidgets
│   ├── admin/                  # AdminPage (collector → team mapping)
│   ├── components/             # WidgetCard, WidgetEditor, widget types
│   └── hooks/                  # useBigQuery, useTeamWidgets, useTeamPages, useTeamCollectors
└── server/
    ├── plugin.ts               # DB migrations + resource registration
    ├── bigquery/client.ts      # BigQuery client (uses GCP env vars)
    └── resources/              # dashboard, teamWidgets, teamPages, teamCollectors
```

### Database tables (auto-created / migrated on server start)

| Table | Purpose |
|---|---|
| `rai_team_widgets` | Custom widgets per team + optional page scope |
| `rai_team_pages` | User-created pages per team |
| `rai_team_collectors` | Team → collector assignments |

---

## Development

### Prerequisites
- Node 18, Yarn 1.x
- The plugin lives inside the NocoBase monorepo at `packages/plugins/@rai/plugin-dashboard`
- BigQuery credentials set in `.env` (see Configuration below)

### Hot reload — no build required in dev

The monorepo dev server provides hot reload for both client and server out of the box:

- **Server**: `tsx watch` + `tsconfig-paths` redirects `@rai/plugin-dashboard` directly to `src/`. Any change to a file in `src/server/` triggers an automatic server restart within a few seconds.
- **Client**: The umi dev server imports `src/client` directly (via `.plugins/rai_plugin_dashboard.ts`). Changes to `src/client/` hot-reload in the browser with no action required.

**You only need to restart the server manually when DB schema migrations are added** (new tables or columns in `server/plugin.ts`), since those run once at startup.

### Start dev server

```bash
cd ~/projects/nocobase
yarn dev
```

The app is available at `http://localhost:13000`.

### Run a build (deployment only)

```bash
yarn build @rai/plugin-dashboard --no-dts
```

`--no-dts` is required: `buildDeclaration` strips `paths` aliases before creating the TS program, so `@nocobase/client` type declarations can't be resolved. The JS build works fine.

---

## Configuration

Add the following to `.env` in the monorepo root:

```env
GCP_PROJECT_ID=your-gcp-project
BQ_DATASET=your_dataset
BQ_TABLE=your_table
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

### Configuring teams

The team list is defined in two places:

1. **`src/client/AnalyticsPage.tsx`** — the `TEAMS` array controls which teams appear in the sidebar
2. **`src/client/admin/AdminPage.tsx`** — the same `TEAMS` array controls which teams appear in the settings panel

Both arrays must be kept in sync. A future improvement would centralise this into a DB table.

---

## Deployment

1. Build the plugin:
   ```bash
   yarn build @rai/plugin-dashboard --no-dts
   ```
2. Copy the plugin directory (including `dist/` and `node_modules/`) to the target NocoBase instance's `storage/plugins/@rai/plugin-dashboard/`.
3. Restart the NocoBase server — it will run DB migrations on startup and the plugin will be active.

---

## Admin Panel

Navigate to **Settings → Page Analytics** (gear icon in the NocoBase sidebar) to assign collectors to teams.

Each team row shows a multi-select of all collector IDs currently present in BigQuery. Selecting collectors for a team means:
- The team's Overview dashboard pre-filters to those collectors on load
- The filter bar only offers those collectors as options

Leaving a team with no collectors assigned means it shows all data (no filter applied).
