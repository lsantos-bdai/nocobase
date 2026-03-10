export const teamCollectorActions = {
  /** GET /api/rai-team-collectors:list?filter[team]=<team> */
  async list(ctx: any) {
    const team = ctx.action?.params?.filter?.team;
    if (!team) {
      ctx.status = 400;
      ctx.body = { error: 'filter[team] is required' };
      return;
    }
    const [rows] = await ctx.db.sequelize.query(
      `SELECT collector FROM rai_team_collectors WHERE team = ? ORDER BY collector ASC`,
      { replacements: [team] },
    );
    ctx.body = (rows as any[]).map((r: any) => r.collector);
  },

  /**
   * POST /api/rai-team-collectors:set
   * body: { team: string, collectors: string[] }
   * Atomically replaces the full collector list for the given team.
   */
  async set(ctx: any) {
    const { team, collectors } = ctx.request.body ?? {};
    if (!team || !Array.isArray(collectors)) {
      ctx.status = 400;
      ctx.body = { error: 'team and collectors[] are required' };
      return;
    }
    // Use a transaction via Sequelize
    const t = await ctx.db.sequelize.transaction();
    try {
      await ctx.db.sequelize.query(
        `DELETE FROM rai_team_collectors WHERE team = ?`,
        { replacements: [team], transaction: t },
      );
      for (const collector of collectors) {
        if (typeof collector === 'string' && collector.trim()) {
          await ctx.db.sequelize.query(
            `INSERT INTO rai_team_collectors (team, collector) VALUES (?, ?) ON CONFLICT DO NOTHING`,
            { replacements: [team, collector.trim()], transaction: t },
          );
        }
      }
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
    ctx.body = { ok: true, team, collectors };
  },
};
