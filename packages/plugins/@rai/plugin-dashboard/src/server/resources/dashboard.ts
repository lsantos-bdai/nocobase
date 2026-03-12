import { createBigQueryClient } from '../bigquery/client';
import type { PluginRaiDashboardServer, DashboardSettings } from '../plugin';

function T(s: DashboardSettings): string {
  return `\`${s.projectId}.${s.dataset}.${s.table}\``;
}

interface Filters {
  collector?: string;
  collectors?: string[];
  robot_id?: string;
  data_type?: string;
  date_from?: string;
  date_to?: string;
}

function extractFilters(ctx: any): Filters {
  const f = ctx.action?.params?.filter ?? {};
  // collectors may come as a JSON array string or already an array
  let collectors: string[] | undefined;
  if (Array.isArray(f.collectors)) {
    collectors = f.collectors.filter(Boolean);
  } else if (typeof f.collectors === 'string' && f.collectors) {
    try { collectors = JSON.parse(f.collectors); } catch { collectors = [f.collectors]; }
  }
  return {
    collector: f.collector || undefined,
    collectors: collectors && collectors.length > 0 ? collectors : undefined,
    robot_id: f.robot_id || undefined,
    data_type: f.data_type || undefined,
    date_from: f.date_from || undefined,
    date_to: f.date_to || undefined,
  };
}

function buildWhere(
  filters: Filters,
  prefix: 'WHERE' | 'AND' = 'WHERE',
): { clause: string; params: Record<string, any> } {
  const conds: string[] = [];
  const params: Record<string, any> = {};

  if (filters.collectors && filters.collectors.length > 0) {
    conds.push('collector IN UNNEST(@collectors)');
    params.collectors = filters.collectors;
  } else if (filters.collector) {
    conds.push('collector = @collector');
    params.collector = filters.collector;
  }
  if (filters.robot_id) {
    conds.push('robot_id = @robot_id');
    params.robot_id = filters.robot_id;
  }
  if (filters.data_type) {
    conds.push('data_type = @data_type');
    params.data_type = filters.data_type;
  }
  if (filters.date_from) {
    conds.push('DATE(upload_time) >= DATE(@date_from)');
    params.date_from = filters.date_from;
  }
  if (filters.date_to) {
    conds.push('DATE(upload_time) <= DATE(@date_to)');
    params.date_to = filters.date_to;
  }

  return {
    clause: conds.length > 0 ? `${prefix} ${conds.join(' AND ')}` : '',
    params,
  };
}

async function getSettingsFromCtx(ctx: any): Promise<DashboardSettings> {
  const plugin = ctx.app.pm.get('rai-dashboard') as PluginRaiDashboardServer;
  return plugin.getSettings();
}

async function runQuery(settings: DashboardSettings, sql: string, params: Record<string, any> = {}): Promise<any[]> {
  const bq = createBigQueryClient(settings.projectId, settings.accessToken);
  const [rows] = await bq.query({ query: sql, params, location: settings.location });
  return rows;
}

export const actions = {
  /** POST /api/rai-dashboard:query  body: { sql } */
  async query(ctx: any) {
    const { sql } = ctx.request.body ?? {};
    if (!sql || typeof sql !== 'string') {
      ctx.status = 400;
      ctx.body = { error: 'sql is required' };
      return;
    }
    const settings = await getSettingsFromCtx(ctx);
    const rows = await runQuery(settings, sql);
    ctx.body = rows;
  },

  /** GET /api/rai-dashboard:stats */
  async stats(ctx: any) {
    const settings = await getSettingsFromCtx(ctx);
    const filters = extractFilters(ctx);
    const { clause, params } = buildWhere(filters);
    const sql = `
      SELECT
        COUNT(*)                                    AS total_sessions,
        ROUND(SUM(data_size) / 1073741824.0, 2)    AS total_gb,
        COUNT(DISTINCT collector)                   AS unique_collectors,
        COUNT(DISTINCT robot_id)                    AS unique_robots
      FROM ${T(settings)}
      ${clause}
    `;
    const rows = await runQuery(settings, sql, params);
    const r = rows[0] ?? {};
    ctx.body = {
      total_sessions: Number(r.total_sessions ?? 0),
      total_gb: Number(r.total_gb ?? 0),
      unique_collectors: Number(r.unique_collectors ?? 0),
      unique_robots: Number(r.unique_robots ?? 0),
    };
  },

  /** GET /api/rai-dashboard:timeline */
  async timeline(ctx: any) {
    const settings = await getSettingsFromCtx(ctx);
    const filters = extractFilters(ctx);
    const { clause, params } = buildWhere(filters);
    const sql = `
      SELECT
        DATE(upload_time)  AS upload_date,
        COUNT(*)           AS session_count
      FROM ${T(settings)}
      ${clause}
      GROUP BY upload_date
      ORDER BY upload_date ASC
      LIMIT 365
    `;
    const rows = await runQuery(settings, sql, params);
    ctx.body = rows.map((r: any) => ({
      date: r.upload_date?.value ?? String(r.upload_date),
      count: Number(r.session_count),
    }));
  },

  /** GET /api/rai-dashboard:byCollector */
  async byCollector(ctx: any) {
    const settings = await getSettingsFromCtx(ctx);
    const filters = extractFilters(ctx);
    const { clause, params } = buildWhere(filters);
    const sql = `
      SELECT
        COALESCE(collector, '(unknown)')            AS collector,
        COUNT(*)                                    AS session_count,
        ROUND(SUM(data_size) / 1073741824.0, 2)    AS total_gb
      FROM ${T(settings)}
      ${clause}
      GROUP BY collector
      ORDER BY session_count DESC
      LIMIT 30
    `;
    const rows = await runQuery(settings, sql, params);
    ctx.body = rows.map((r: any) => ({
      collector: r.collector,
      count: Number(r.session_count),
      gb: Number(r.total_gb),
    }));
  },

  /** GET /api/rai-dashboard:byDataType */
  async byDataType(ctx: any) {
    const settings = await getSettingsFromCtx(ctx);
    const filters = extractFilters(ctx);
    const { clause, params } = buildWhere(filters);
    const sql = `
      SELECT
        COALESCE(data_type, '(unknown)')  AS data_type,
        COUNT(*)                          AS session_count
      FROM ${T(settings)}
      ${clause}
      GROUP BY data_type
      ORDER BY session_count DESC
      LIMIT 20
    `;
    const rows = await runQuery(settings, sql, params);
    ctx.body = rows.map((r: any) => ({
      type: r.data_type,
      count: Number(r.session_count),
    }));
  },

  /** GET /api/rai-dashboard:recent */
  async recent(ctx: any) {
    const settings = await getSettingsFromCtx(ctx);
    const filters = extractFilters(ctx);
    const { clause, params } = buildWhere(filters);
    const sql = `
      SELECT
        session_id,
        collector,
        robot_id,
        data_type,
        ROUND(data_size / 1073741824.0, 3)  AS size_gb,
        upload_time
      FROM ${T(settings)}
      ${clause}
      ORDER BY upload_time DESC
      LIMIT 50
    `;
    const rows = await runQuery(settings, sql, params);
    ctx.body = rows.map((r: any) => ({
      ...r,
      upload_time: r.upload_time?.value ?? String(r.upload_time),
      size_gb: Number(r.size_gb),
    }));
  },

  /** GET /api/rai-dashboard:filterOptions */
  async filterOptions(ctx: any) {
    const settings = await getSettingsFromCtx(ctx);
    const [collectors, robots, dataTypes] = await Promise.all([
      runQuery(
        settings,
        `SELECT DISTINCT collector FROM ${T(settings)} WHERE collector IS NOT NULL ORDER BY collector LIMIT 200`,
      ),
      runQuery(
        settings,
        `SELECT DISTINCT robot_id FROM ${T(settings)} WHERE robot_id IS NOT NULL ORDER BY robot_id LIMIT 200`,
      ),
      runQuery(
        settings,
        `SELECT DISTINCT data_type FROM ${T(settings)} WHERE data_type IS NOT NULL ORDER BY data_type LIMIT 100`,
      ),
    ]);
    ctx.body = {
      collectors: collectors.map((r: any) => r.collector),
      robots: robots.map((r: any) => r.robot_id),
      dataTypes: dataTypes.map((r: any) => r.data_type),
    };
  },
};
