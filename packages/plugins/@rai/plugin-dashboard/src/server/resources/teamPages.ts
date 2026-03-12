import { randomUUID } from 'crypto';

function rowToPage(r: any) {
  return {
    id: r.id,
    team: r.team,
    title: r.title,
    content: r.content ?? '',
    sortOrder: r.sort_order ?? 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export const teamPageActions = {
  /** GET /api/rai-team-pages:list?filter[team]=<team> */
  async list(ctx: any) {
    const team = ctx.action?.params?.filter?.team;
    if (!team) {
      ctx.status = 400;
      ctx.body = { error: 'filter[team] is required' };
      return;
    }
    const [rows] = await ctx.db.sequelize.query(
      `SELECT * FROM rai_team_pages WHERE team = ? ORDER BY sort_order ASC, created_at ASC`,
      { replacements: [team] },
    );
    ctx.body = (rows as any[]).map(rowToPage);
  },

  /** POST /api/rai-team-pages:create  body: { team, title, content? } */
  async create(ctx: any) {
    const body = ctx.request.body ?? {};
    const { team, title, content } = body;
    if (!team || !title) {
      ctx.status = 400;
      ctx.body = { error: 'team and title are required' };
      return;
    }
    const [[maxRow]]: any = await ctx.db.sequelize.query(
      `SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM rai_team_pages WHERE team = ?`,
      { replacements: [team] },
    );
    const sortOrder = (maxRow?.max_order ?? -1) + 1;
    const id = randomUUID();
    await ctx.db.sequelize.query(
      `INSERT INTO rai_team_pages (id, team, title, content, sort_order) VALUES (?, ?, ?, ?, ?)`,
      { replacements: [id, team, title, content ?? null, sortOrder] },
    );
    const [[created]]: any = await ctx.db.sequelize.query(
      `SELECT * FROM rai_team_pages WHERE id = ?`,
      { replacements: [id] },
    );
    ctx.body = rowToPage(created);
  },

  /** PATCH /api/rai-team-pages:update/<id>  body: { title?, content? } */
  async update(ctx: any) {
    const id = ctx.action?.params?.filterByTk;
    const body = ctx.request.body ?? {};
    const sets: string[] = [];
    const vals: any[] = [];
    if (body.title !== undefined) { sets.push('title = ?'); vals.push(body.title); }
    if (body.content !== undefined) { sets.push('content = ?'); vals.push(body.content); }
    if (sets.length === 0) {
      ctx.status = 400;
      ctx.body = { error: 'No updatable fields provided' };
      return;
    }
    sets.push('updated_at = CURRENT_TIMESTAMP');
    vals.push(id);
    await ctx.db.sequelize.query(
      `UPDATE rai_team_pages SET ${sets.join(', ')} WHERE id = ?`,
      { replacements: vals },
    );
    const [[updated]]: any = await ctx.db.sequelize.query(
      `SELECT * FROM rai_team_pages WHERE id = ?`,
      { replacements: [id] },
    );
    ctx.body = rowToPage(updated);
  },

  /** DELETE /api/rai-team-pages:destroy/<id> */
  async destroy(ctx: any) {
    const id = ctx.action?.params?.filterByTk;
    await ctx.db.sequelize.query(
      `DELETE FROM rai_team_pages WHERE id = ?`,
      { replacements: [id] },
    );
    ctx.body = { id };
  },

  /** POST /api/rai-team-pages:upsertSection  body: { team, sectionKey, content } */
  async upsertSection(ctx: any) {
    const { team, sectionKey, content } = ctx.request.body ?? {};
    if (!team || !sectionKey) {
      ctx.status = 400;
      ctx.body = { error: 'team and sectionKey are required' };
      return;
    }
    const [[existing]]: any = await ctx.db.sequelize.query(
      `SELECT id FROM rai_team_pages WHERE team = ? AND section_key = ?`,
      { replacements: [team, sectionKey] },
    );
    if (existing) {
      await ctx.db.sequelize.query(
        `UPDATE rai_team_pages SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        { replacements: [content ?? null, existing.id] },
      );
      const [[updated]]: any = await ctx.db.sequelize.query(
        `SELECT * FROM rai_team_pages WHERE id = ?`,
        { replacements: [existing.id] },
      );
      ctx.body = rowToPage(updated);
    } else {
      const id = randomUUID();
      await ctx.db.sequelize.query(
        `INSERT INTO rai_team_pages (id, team, title, content, section_key, sort_order) VALUES (?, ?, ?, ?, ?, -1)`,
        { replacements: [id, team, sectionKey, content ?? null, sectionKey] },
      );
      const [[created]]: any = await ctx.db.sequelize.query(
        `SELECT * FROM rai_team_pages WHERE id = ?`,
        { replacements: [id] },
      );
      ctx.body = rowToPage(created);
    }
  },

  /** GET /api/rai-team-pages:getSection?team=<team>&sectionKey=<key> */
  async getSection(ctx: any) {
    const { team, sectionKey } = ctx.action?.params ?? {};
    if (!team || !sectionKey) {
      ctx.status = 400;
      ctx.body = { error: 'team and sectionKey are required' };
      return;
    }
    const [[row]]: any = await ctx.db.sequelize.query(
      `SELECT * FROM rai_team_pages WHERE team = ? AND section_key = ?`,
      { replacements: [team, sectionKey] },
    );
    ctx.body = row ? rowToPage(row) : { content: '' };
  },

  /** POST /api/rai-team-pages:reorder  body: { team, orderedIds: string[] } */
  async reorder(ctx: any) {
    const { team, orderedIds } = ctx.request.body ?? {};
    if (!team || !Array.isArray(orderedIds) || orderedIds.length === 0) {
      ctx.status = 400;
      ctx.body = { error: 'team and orderedIds[] are required' };
      return;
    }
    const placeholders = orderedIds.map(() => '?').join(', ');
    const [rows]: any = await ctx.db.sequelize.query(
      `SELECT id FROM rai_team_pages WHERE team = ? AND id IN (${placeholders})`,
      { replacements: [team, ...orderedIds] },
    );
    const validIds = new Set((rows as any[]).map((r: any) => r.id));
    if (validIds.size !== orderedIds.length) {
      ctx.status = 400;
      ctx.body = { error: 'One or more page ids not found for this team' };
      return;
    }
    for (let i = 0; i < orderedIds.length; i++) {
      await ctx.db.sequelize.query(
        `UPDATE rai_team_pages SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        { replacements: [i, orderedIds[i]] },
      );
    }
    ctx.body = { ok: true };
  },
};
