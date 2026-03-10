import { Plugin } from '@nocobase/server';
import { actions } from './resources/dashboard';
import { teamCollectorActions } from './resources/teamCollectors';
import { teamPageActions } from './resources/teamPages';
import { teamWidgetActions } from './resources/teamWidgets';

export class PluginRaiDashboardServer extends Plugin {
  async load() {
    this.app.resourceManager.define({
      name: 'rai-dashboard',
      actions,
    });
    this.app.acl.allow('rai-dashboard', '*', 'loggedIn');

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
