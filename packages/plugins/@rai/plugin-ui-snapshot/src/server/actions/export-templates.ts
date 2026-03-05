/**
 * Export Templates Action
 *
 * GET /api/ui-snapshot:exportTemplates
 *
 * Exports all block templates (flowModelTemplates) with their full flowModel trees.
 * Each template includes its metadata record and the complete flowModel subtree
 * rooted at its targetUid. Original UIDs are preserved for cross-server migration.
 */
import { Context, Next } from '@nocobase/actions';
import { TemplateRecord, TemplateSnapshot } from '../types';

export async function exportTemplates(ctx: Context, next: Next) {
  const db = ctx.db;

  // Fetch all template metadata records
  const templateRepo = db.getRepository('flowModelTemplates');
  const templates = await templateRepo.find({ raw: true });

  if (!templates || templates.length === 0) {
    ctx.body = [];
    ctx.withoutDataWrapping = true;
    return next();
  }

  // FlowModelRepository has findModelById for reading full trees
  const flowModelRepo = db.getRepository('flowModels') as any;
  const results: TemplateSnapshot[] = [];

  for (const tpl of templates) {
    const record: TemplateRecord = {
      uid: tpl.uid,
      name: tpl.name,
      description: tpl.description || undefined,
      targetUid: tpl.targetUid,
      useModel: tpl.useModel || undefined,
      type: tpl.type || undefined,
      dataSourceKey: tpl.dataSourceKey || undefined,
      collectionName: tpl.collectionName || undefined,
      associationName: tpl.associationName || undefined,
      filterByTk: tpl.filterByTk || undefined,
      sourceId: tpl.sourceId || undefined,
    };

    // findModelById returns the full nested flowModel tree from the root targetUid
    let model: Record<string, unknown> | null = null;
    try {
      model = await flowModelRepo.findModelById(tpl.targetUid, {
        includeAsyncNode: true,
      });
    } catch {
      ctx.app.logger.warn(
        `Template "${tpl.name}" (uid=${tpl.uid}): failed to fetch flowModel tree for targetUid=${tpl.targetUid}, skipping`,
      );
      continue;
    }

    if (!model) {
      ctx.app.logger.warn(
        `Template "${tpl.name}" (uid=${tpl.uid}): no flowModel tree found for targetUid=${tpl.targetUid}, skipping`,
      );
      continue;
    }

    results.push({ template: record, model });
  }

  ctx.body = results;
  ctx.withoutDataWrapping = true;

  await next();
}
