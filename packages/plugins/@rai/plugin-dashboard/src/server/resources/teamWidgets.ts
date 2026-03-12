import { randomUUID } from 'crypto';

function rowToWidget(r: any) {
  return {
    id: r.id,
    team: r.team,
    title: r.title,
    description: r.description ?? undefined,
    type: r.type,
    sql: r.sql,
    content: r.content ?? undefined,
    colSpan: r.col_span ?? 12,
    xColumn: r.x_column ?? undefined,
    yColumn: r.y_column ?? undefined,
    categoryColumn: r.category_column ?? undefined,
    valueColumn: r.value_column ?? undefined,
    pageId: r.page_id ?? undefined,
    sortOrder: r.sort_order ?? 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export const teamWidgetActions = {
  /** GET /api/rai-team-widgets:list?filter[team]=<team>&filter[page_id]=<id> */
  async list(ctx: any) {
    const team = ctx.action?.params?.filter?.team;
    if (!team) {
      ctx.status = 400;
      ctx.body = { error: 'filter[team] is required' };
      return;
    }
    const pageId = ctx.action?.params?.filter?.page_id;
    let sql: string;
    let replacements: any[];
    if (pageId === 'null' || pageId === null) {
      // Explicit request for widgets with no page (team overview canvas)
      sql = `SELECT * FROM rai_team_widgets WHERE team = ? AND page_id IS NULL ORDER BY sort_order ASC, created_at ASC`;
      replacements = [team];
    } else if (pageId) {
      sql = `SELECT * FROM rai_team_widgets WHERE team = ? AND page_id = ? ORDER BY sort_order ASC, created_at ASC`;
      replacements = [team, pageId];
    } else {
      // No page_id filter — return all widgets for the team
      sql = `SELECT * FROM rai_team_widgets WHERE team = ? ORDER BY sort_order ASC, created_at ASC`;
      replacements = [team];
    }
    const [rows] = await ctx.db.sequelize.query(sql, { replacements });
    ctx.body = (rows as any[]).map(rowToWidget);
  },

  /** POST /api/rai-team-widgets:create */
  async create(ctx: any) {
    const body = ctx.request.body ?? {};
    const { team, title, description, type, sql, content, colSpan, xColumn, yColumn, categoryColumn, valueColumn, pageId } = body;
    const isMarkdown = type === 'markdown';
    if (!team || !title || !type || (!isMarkdown && !sql)) {
      ctx.status = 400;
      ctx.body = { error: 'team, title, type are required; sql is required for non-markdown widgets' };
      return;
    }
    const [[maxRow]]: any = await ctx.db.sequelize.query(
      pageId
        ? `SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM rai_team_widgets WHERE team = ? AND page_id = ?`
        : `SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM rai_team_widgets WHERE team = ? AND page_id IS NULL`,
      { replacements: pageId ? [team, pageId] : [team] },
    );
    const sortOrder = (maxRow?.max_order ?? -1) + 1;
    const id = randomUUID();
    await ctx.db.sequelize.query(
      `INSERT INTO rai_team_widgets
         (id, team, title, description, type, sql, content, col_span, x_column, y_column, category_column, value_column, page_id, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      {
        replacements: [
          id, team, title, description ?? null, type, sql ?? null, content ?? null,
          colSpan ?? 12, xColumn ?? null, yColumn ?? null,
          categoryColumn ?? null, valueColumn ?? null, pageId ?? null, sortOrder,
        ],
      },
    );
    const [[created]]: any = await ctx.db.sequelize.query(
      `SELECT * FROM rai_team_widgets WHERE id = ?`,
      { replacements: [id] },
    );
    ctx.body = rowToWidget(created);
  },

  /** PATCH /api/rai-team-widgets:update/<id> */
  async update(ctx: any) {
    const id = ctx.action?.params?.filterByTk;
    const body = ctx.request.body ?? {};
    const allowed = ['title', 'description', 'type', 'sql', 'content', 'col_span', 'x_column', 'y_column', 'category_column', 'value_column', 'page_id'];
    const camelToSnake: Record<string, string> = {
      colSpan: 'col_span', xColumn: 'x_column', yColumn: 'y_column',
      categoryColumn: 'category_column', valueColumn: 'value_column',
      pageId: 'page_id',
    };

    const sets: string[] = [];
    const vals: any[] = [];
    for (const [k, v] of Object.entries(body)) {
      const dbCol = camelToSnake[k] ?? k;
      if (allowed.includes(dbCol)) {
        sets.push(`${dbCol} = ?`);
        vals.push(v ?? null);
      }
    }
    if (sets.length === 0) {
      ctx.status = 400;
      ctx.body = { error: 'No updatable fields provided' };
      return;
    }
    sets.push('updated_at = CURRENT_TIMESTAMP');
    vals.push(id);
    await ctx.db.sequelize.query(
      `UPDATE rai_team_widgets SET ${sets.join(', ')} WHERE id = ?`,
      { replacements: vals },
    );
    const [[updated]]: any = await ctx.db.sequelize.query(
      `SELECT * FROM rai_team_widgets WHERE id = ?`,
      { replacements: [id] },
    );
    ctx.body = rowToWidget(updated);
  },

  /** DELETE /api/rai-team-widgets:destroy/<id> */
  async destroy(ctx: any) {
    const id = ctx.action?.params?.filterByTk;
    await ctx.db.sequelize.query(
      `DELETE FROM rai_team_widgets WHERE id = ?`,
      { replacements: [id] },
    );
    ctx.body = { id };
  },

  /** POST /api/rai-team-widgets:reorder  body: { team, orderedIds: string[] } */
  async reorder(ctx: any) {
    const { team, orderedIds } = ctx.request.body ?? {};
    if (!team || !Array.isArray(orderedIds) || orderedIds.length === 0) {
      ctx.status = 400;
      ctx.body = { error: 'team and orderedIds[] are required' };
      return;
    }
    const placeholders = orderedIds.map(() => '?').join(', ');
    const [rows]: any = await ctx.db.sequelize.query(
      `SELECT id FROM rai_team_widgets WHERE team = ? AND id IN (${placeholders})`,
      { replacements: [team, ...orderedIds] },
    );
    const validIds = new Set((rows as any[]).map((r: any) => r.id));
    if (validIds.size !== orderedIds.length) {
      ctx.status = 400;
      ctx.body = { error: 'One or more widget ids not found for this team' };
      return;
    }
    for (let i = 0; i < orderedIds.length; i++) {
      await ctx.db.sequelize.query(
        `UPDATE rai_team_widgets SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        { replacements: [i, orderedIds[i]] },
      );
    }
    ctx.body = { ok: true };
  },
};
