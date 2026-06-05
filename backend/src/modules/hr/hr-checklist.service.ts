import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class HrChecklistService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  listTemplates(tenantId: string, entityId: number, workflowType?: string) {
    const params: unknown[] = [tenantId, entityId];
    let sql = `SELECT * FROM hr_workflow_checklists WHERE tenant_id = $1 AND entity_id = $2`;
    if (workflowType) {
      params.push(workflowType);
      sql += ` AND workflow_type = $3`;
    }
    sql += ` ORDER BY workflow_type, sort_order`;
    return this.dataSource.query(sql, params);
  }

  async createTemplate(tenantId: string, entityId: number, dto: Record<string, unknown>) {
    const rows = await this.dataSource.query(
      `INSERT INTO hr_workflow_checklists (
         tenant_id, entity_id, workflow_type, task_name, is_mandatory, assigned_to_role, sort_order
       ) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        tenantId,
        entityId,
        dto.workflow_type,
        dto.task_name,
        dto.is_mandatory ?? true,
        dto.assigned_to_role,
        dto.sort_order ?? 0,
      ],
    );
    return rows[0];
  }

  async deleteTemplate(tenantId: string, entityId: number, templateId: string) {
    await this.dataSource.query(
      `DELETE FROM hr_workflow_checklists WHERE tenant_id = $1 AND entity_id = $2 AND template_id = $3`,
      [tenantId, entityId, templateId],
    );
    return { deleted: true };
  }

  async spawnOnboardingInstances(
    tenantId: string,
    entityId: number,
    userId: string,
    pipelineId: string,
  ) {
    const templates = await this.listTemplates(tenantId, entityId, 'ONBOARDING');
    for (const t of templates) {
      await this.dataSource.query(
        `INSERT INTO hr_checklist_instances (template_id, pipeline_id, user_id, status)
         VALUES ($1,$2,$3,'PENDING')`,
        [t.template_id, pipelineId, userId],
      );
    }
    return { spawned: templates.length };
  }

  async spawnOffboardingInstances(
    tenantId: string,
    entityId: number,
    userId: string,
    resignationId: string,
  ) {
    const templates = await this.listTemplates(tenantId, entityId, 'OFFBOARDING');
    for (const t of templates) {
      await this.dataSource.query(
        `INSERT INTO hr_checklist_instances (template_id, resignation_id, user_id, status)
         VALUES ($1,$2,$3,'PENDING')`,
        [t.template_id, resignationId, userId],
      );
    }
    return { spawned: templates.length };
  }

  async getPipelineChecklistProgress(pipelineId: string) {
    const rows = await this.dataSource.query(
      `SELECT i.*, t.task_name, t.assigned_to_role, t.is_mandatory
       FROM hr_checklist_instances i
       JOIN hr_workflow_checklists t ON t.template_id = i.template_id
       WHERE i.pipeline_id = $1
       ORDER BY t.sort_order`,
      [pipelineId],
    );
    const total = rows.length;
    const done = rows.filter((r: { status: string }) => r.status === 'COMPLETED').length;
    return { tasks: rows, total, completed: done, progress_percent: total ? Math.round((done / total) * 100) : 0 };
  }

  async updateExitStatus(
    resignationId: string,
    exitStatus: string,
    fnfDeductPenalty?: boolean,
  ) {
    const rows = await this.dataSource.query(
      `UPDATE hr_resignation_requests SET
         exit_status = $2,
         fnf_deduct_checklist_penalty = COALESCE($3, fnf_deduct_checklist_penalty),
         updated_at = NOW()
       WHERE resignation_id = $1 RETURNING *`,
      [resignationId, exitStatus, fnfDeductPenalty ?? null],
    );
    if (!rows[0]) throw new NotFoundException('Resignation not found');
    return rows[0];
  }
}
