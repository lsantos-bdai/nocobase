import { Plugin } from '@nocobase/server';
import { actions } from './resources/dashboard';
import { teamCollectorActions } from './resources/teamCollectors';
import { teamPageActions } from './resources/teamPages';
import { teamWidgetActions } from './resources/teamWidgets';

export interface DashboardSettings {
  projectId: string;
  dataset: string;
  table: string;
  location: string;
  accessToken: string;
}

export class PluginRaiDashboardServer extends Plugin {
  async install() {
    const existing = await this.db.getRepository('raiDashboardSettings').findOne();
    if (!existing) {
      await this.db.getRepository('raiDashboardSettings').create({});
    }
  }

  /** Read settings from DB and resolve {{$env.*}} templates in all fields. */
  async getSettings(): Promise<DashboardSettings> {
    const row = await this.db.getRepository('raiDashboardSettings').findOne();
    if (!row) {
      throw new Error('Dashboard settings not configured. Go to Settings > Page Analytics to configure BigQuery connection.');
    }
    const raw = row.toJSON();
    const resolved = this.app.environment.renderJsonTemplate({
      projectId: raw.projectId ?? '',
      dataset: raw.dataset ?? '',
      table: raw.table ?? 'sessions',
      location: raw.location ?? 'us-central1',
      accessToken: raw.accessToken ?? '',
    });
    return resolved as DashboardSettings;
  }

  async load() {
    // ── BigQuery dashboard resource ──
    this.app.resourceManager.define({
      name: 'rai-dashboard',
      actions,
    });
    this.app.acl.allow('rai-dashboard', '*', 'loggedIn');

    // ── Settings resource ──
    this.app.resourceManager.define({
      name: 'raiDashboardSettings',
      actions: {
        get: async (ctx, next) => {
          const row = await this.db.getRepository('raiDashboardSettings').findOne();
          if (!row) {
            ctx.body = {};
          } else {
            const data = row.toJSON();
            // Never expose the raw token to the client
            ctx.body = {
              projectId: data.projectId ?? '',
              dataset: data.dataset ?? '',
              table: data.table ?? 'sessions',
              location: data.location ?? 'us-central1',
              accessToken: data.accessToken ? '••••••••' : '',
            };
          }
          await next();
        },
        update: async (ctx, next) => {
          const values = ctx.action?.params?.values || {};
          const row = await this.db.getRepository('raiDashboardSettings').findOne();
          const updateData: Record<string, any> = {};
          if (values.projectId !== undefined) updateData.projectId = values.projectId;
          if (values.dataset !== undefined) updateData.dataset = values.dataset;
          if (values.table !== undefined) updateData.table = values.table;
          if (values.location !== undefined) updateData.location = values.location;
          // Only update the token if the client actually sent a new value
          // (not the masked '••••••••' placeholder)
          if (values.accessToken && values.accessToken !== '••••••••') {
            updateData.accessToken = values.accessToken;
          }
          if (row) {
            await row.update(updateData);
          } else {
            await this.db.getRepository('raiDashboardSettings').create({ values: updateData });
          }
          ctx.body = { ok: true };
          await next();
        },
      },
    });

    this.app.acl.allow('raiDashboardSettings', 'get', 'loggedIn');
    this.app.acl.registerSnippet({
      name: `pm.${this.name}.settings`,
      actions: ['raiDashboardSettings:update'],
    });

    // ── Raw SQL tables (existing) ──
    await this.db.sequelize.query(`
      CREATE TABLE IF NOT EXISTS rai_team_widgets (
        id            VARCHAR(36)  NOT NULL PRIMARY KEY,
        team          VARCHAR(64)  NOT NULL,
        title         VARCHAR(255) NOT NULL,
        description   TEXT,
        type          VARCHAR(32)  NOT NULL,
        sql           TEXT         NOT NULL,
        col_span      INT          NOT NULL DEFAULT 12,
        x_column      VARCHAR(128),
        y_column      VARCHAR(128),
        category_column VARCHAR(128),
        value_column  VARCHAR(128),
        sort_order    INT          NOT NULL DEFAULT 0,
        created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.db.sequelize.query(`
      ALTER TABLE rai_team_widgets ADD COLUMN IF NOT EXISTS page_id VARCHAR(36)
    `);

    await this.db.sequelize.query(`
      ALTER TABLE rai_team_widgets ADD COLUMN IF NOT EXISTS content TEXT
    `);

    await this.db.sequelize.query(`
      CREATE TABLE IF NOT EXISTS rai_team_pages (
        id          VARCHAR(36)   NOT NULL PRIMARY KEY,
        team        VARCHAR(64)   NOT NULL,
        title       VARCHAR(255)  NOT NULL,
        content     TEXT,
        section_key VARCHAR(128),
        sort_order  INT           NOT NULL DEFAULT 0,
        created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.db.sequelize.query(`
      ALTER TABLE rai_team_pages ADD COLUMN IF NOT EXISTS section_key VARCHAR(128)
    `);

    await this.db.sequelize.query(`
      CREATE TABLE IF NOT EXISTS rai_team_collectors (
        team        VARCHAR(64)   NOT NULL,
        collector   VARCHAR(255)  NOT NULL,
        PRIMARY KEY (team, collector)
      )
    `);

    // ── Team resources (existing) ──
    this.app.resourceManager.define({
      name: 'rai-team-widgets',
      actions: teamWidgetActions,
    });
    this.app.acl.allow('rai-team-widgets', '*', 'loggedIn');

    this.app.resourceManager.define({
      name: 'rai-team-pages',
      actions: teamPageActions,
    });
    this.app.acl.allow('rai-team-pages', '*', 'loggedIn');

    this.app.resourceManager.define({
      name: 'rai-team-collectors',
      actions: teamCollectorActions,
    });
    this.app.acl.allow('rai-team-collectors', '*', 'loggedIn');
  }
}

export default PluginRaiDashboardServer;
