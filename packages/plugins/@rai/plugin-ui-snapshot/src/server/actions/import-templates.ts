/**
 * Import Templates Action
 *
 * POST /api/ui-snapshot:importTemplates
 *
 * Imports a single block template with its full flowModel tree.
 * Always overwrites: if a template with the same uid already exists,
 * the old flowModel tree and template record are removed first.
 *
 * Original UIDs are preserved so that ReferenceBlockModel pointers
 * from UI page snapshots resolve correctly on the target server.
 *
 * Request body: TemplateSnapshot { template: TemplateRecord, model: object }
 * Response: TemplateImportResponse { imported: boolean, uid: string, name: string }
 */
import { Context, Next } from '@nocobase/actions';
import { TemplateSnapshot, TemplateImportResponse } from '../types';

export async function importTemplates(ctx: Context, next: Next) {
  const body = ctx.action.params.values as TemplateSnapshot;

  if (!body?.template || !body?.model) {
    ctx.throw(400, 'Missing required fields: template and model');
  }

  const { template, model } = body;

  if (!template.uid || !template.targetUid) {
    ctx.throw(400, 'Template must have uid and targetUid fields');
  }

  if (!model.uid) {
    ctx.throw(400, 'Model must have a uid field');
  }

  const db = ctx.db;
  const transaction = await db.sequelize.transaction();

  try {
    const templateRepo = db.getRepository('flowModelTemplates');
    // FlowModelRepository has insertModel/remove for tree operations
    const flowModelRepo = db.getRepository('flowModels') as any;

    // Check if template with this uid already exists
    const existing = await templateRepo.findOne({
      filter: { uid: template.uid },
      transaction,
    });

    if (existing) {
      // Remove existing flowModel tree first (cascade deletes all descendants + tree paths)
      const existingTargetUid = existing.get('targetUid') as string;
      if (existingTargetUid) {
        try {
          await flowModelRepo.remove(existingTargetUid, { transaction });
        } catch {
          ctx.app.logger.warn(
            `Template "${template.name}": failed to remove old flowModel tree targetUid=${existingTargetUid}`,
          );
        }
      }

      // Remove the template record
      await templateRepo.destroy({
        filter: { uid: template.uid },
        transaction,
      });
    }

    // Also check if a flowModel with the target uid already exists
    // (could happen if the tree exists but the template record was already cleaned up)
    const existingModel = await db.getRepository('flowModels').findOne({
      filter: { uid: template.targetUid },
      transaction,
    });

    if (existingModel) {
      try {
        await flowModelRepo.remove(template.targetUid, { transaction });
      } catch {
        ctx.app.logger.warn(
          `Template "${template.name}": failed to remove orphaned flowModel uid=${template.targetUid}`,
        );
      }
    }

    // Insert the flowModel tree with preserved UIDs.
    // FlowModelRepository.insertModel() decomposes a nested model into
    // individual nodes and inserts them with their tree path relationships
    // (both flowModels rows and flowModelTreePath closure table entries).
    await flowModelRepo.insertModel(model, { transaction });

    // Create the template metadata record
    await templateRepo.create({
      values: {
        uid: template.uid,
        name: template.name,
        description: template.description || null,
        targetUid: template.targetUid,
        useModel: template.useModel || null,
        type: template.type || null,
        dataSourceKey: template.dataSourceKey || null,
        collectionName: template.collectionName || null,
        associationName: template.associationName || null,
        filterByTk: template.filterByTk || null,
        sourceId: template.sourceId || null,
      },
      transaction,
    });

    await transaction.commit();

    const response: TemplateImportResponse = {
      imported: true,
      uid: template.uid,
      name: template.name,
    };

    ctx.body = response;
    ctx.withoutDataWrapping = true;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  await next();
}
