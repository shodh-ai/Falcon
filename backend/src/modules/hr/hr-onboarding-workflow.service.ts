import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export const ONBOARDING_STAGES = [
  'Offer Management',
  'Candidate Onboarding',
  'Employee Onboarding',
] as const;

@Injectable()
export class HrOnboardingWorkflowService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  listTemplates(tenantId: string, entityId: number, workflowType = 'ONBOARDING') {
    return this.dataSource.query(
      `SELECT template_id, workflow_type, stage_name, task_name, is_mandatory, step_order
       FROM hr_workflow_templates
       WHERE tenant_id = $1 AND entity_id = $2 AND workflow_type = $3
       ORDER BY stage_name, step_order, task_name`,
      [tenantId, entityId, workflowType],
    );
  }

  async createTemplate(
    tenantId: string,
    entityId: number,
    dto: {
      workflow_type?: string;
      stage_name: string;
      task_name: string;
      is_mandatory?: boolean;
      step_order?: number;
    },
  ) {
    const stage = dto.stage_name?.trim();
    const task = dto.task_name?.trim();
    if (!stage || !task) throw new BadRequestException('stage_name and task_name are required');

    let order = dto.step_order;
    if (order == null) {
      const [maxRow] = await this.dataSource.query<Array<{ max: number }>>(
        `SELECT COALESCE(MAX(step_order), 0)::int AS max
         FROM hr_workflow_templates
         WHERE tenant_id = $1 AND entity_id = $2 AND workflow_type = $3 AND stage_name = $4`,
        [tenantId, entityId, dto.workflow_type ?? 'ONBOARDING', stage],
      );
      order = (maxRow?.max ?? 0) + 1;
    }

    const rows = await this.dataSource.query(
      `INSERT INTO hr_workflow_templates (
         tenant_id, entity_id, workflow_type, stage_name, task_name, is_mandatory, step_order
       ) VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        tenantId,
        entityId,
        dto.workflow_type ?? 'ONBOARDING',
        stage,
        task,
        dto.is_mandatory ?? true,
        order,
      ],
    );
    return rows[0];
  }

  async updateTemplate(
    tenantId: string,
    entityId: number,
    templateId: string,
    dto: { task_name?: string; is_mandatory?: boolean; stage_name?: string },
  ) {
    const rows = await this.dataSource.query(
      `UPDATE hr_workflow_templates SET
         task_name = COALESCE($4, task_name),
         is_mandatory = COALESCE($5, is_mandatory),
         stage_name = COALESCE($6, stage_name)
       WHERE tenant_id = $1 AND entity_id = $2 AND template_id = $3
       RETURNING *`,
      [tenantId, entityId, templateId, dto.task_name ?? null, dto.is_mandatory ?? null, dto.stage_name ?? null],
    );
    if (!rows[0]) throw new NotFoundException('Workflow template not found');
    return rows[0];
  }

  async reorderTemplates(
    tenantId: string,
    entityId: number,
    stageName: string,
    orderedTemplateIds: string[],
  ) {
    for (let i = 0; i < orderedTemplateIds.length; i++) {
      await this.dataSource.query(
        `UPDATE hr_workflow_templates SET step_order = $4
         WHERE tenant_id = $1 AND entity_id = $2 AND template_id = $3 AND stage_name = $5`,
        [tenantId, entityId, orderedTemplateIds[i], i + 1, stageName],
      );
    }
    return this.listTemplates(tenantId, entityId, 'ONBOARDING').then((rows) =>
      rows.filter((r: { stage_name: string }) => r.stage_name === stageName),
    );
  }

  async deleteTemplate(tenantId: string, entityId: number, templateId: string) {
    await this.dataSource.query(
      `DELETE FROM hr_workflow_templates WHERE tenant_id = $1 AND entity_id = $2 AND template_id = $3`,
      [tenantId, entityId, templateId],
    );
    return { deleted: true };
  }

  async listNewHires(tenantId: string, entityId: number) {
    return this.dataSource.query(
      `SELECT
         u.user_id,
         u.name,
         u.official_email AS email,
         p.designation,
         p.joining_date,
         p.employee_id,
         a.applicant_id,
         j.title AS job_title,
         COUNT(t.task_id)::int AS total_tasks,
         COUNT(t.task_id) FILTER (WHERE t.status = 'COMPLETED')::int AS completed_tasks,
         CASE
           WHEN COUNT(t.task_id) = 0 THEN 0
           ELSE ROUND(
             (COUNT(t.task_id) FILTER (WHERE t.status = 'COMPLETED')::numeric / COUNT(t.task_id)) * 100
           )::int
         END AS progress_percent
       FROM hr_employee_onboarding_tasks t
       JOIN users u ON u.user_id = t.user_id
       LEFT JOIN hr_employee_profiles p ON p.user_id = u.user_id AND p.tenant_id = t.tenant_id
       LEFT JOIN hr_applicants a ON a.hired_user_id = u.user_id AND a.tenant_id = t.tenant_id
       LEFT JOIN hr_job_postings j ON j.job_id = a.job_id
       WHERE t.tenant_id = $1 AND t.entity_id = $2
       GROUP BY u.user_id, u.name, u.official_email, p.designation, p.joining_date,
                p.employee_id, a.applicant_id, j.title
       ORDER BY p.joining_date DESC NULLS LAST, u.name ASC`,
      [tenantId, entityId],
    );
  }

  async getEmployeeWorkflow(tenantId: string, entityId: number, userId: string) {
    const [employee] = await this.dataSource.query(
      `SELECT u.user_id, u.name, u.official_email AS email,
              p.designation, p.joining_date, p.employee_id,
              a.applicant_id, j.title AS job_title
       FROM users u
       LEFT JOIN hr_employee_profiles p ON p.user_id = u.user_id AND p.tenant_id = $1
       LEFT JOIN hr_applicants a ON a.hired_user_id = u.user_id AND a.tenant_id = $1
       LEFT JOIN hr_job_postings j ON j.job_id = a.job_id
       WHERE u.user_id = $2 AND u.tenant_id = $1`,
      [tenantId, userId],
    );
    if (!employee) throw new NotFoundException('Employee not found');

    const tasks = await this.dataSource.query(
      `SELECT
         et.task_id,
         et.status,
         et.completed_at,
         et.completed_by,
         cb.name AS completed_by_name,
         wt.template_id,
         wt.stage_name,
         wt.task_name,
         wt.is_mandatory,
         wt.step_order
       FROM hr_employee_onboarding_tasks et
       JOIN hr_workflow_templates wt ON wt.template_id = et.template_id
       LEFT JOIN users cb ON cb.user_id = et.completed_by
       WHERE et.tenant_id = $1 AND et.entity_id = $2 AND et.user_id = $3
       ORDER BY wt.stage_name, wt.step_order`,
      [tenantId, entityId, userId],
    );

    const total = tasks.length;
    const completed = tasks.filter((t: { status: string }) => t.status === 'COMPLETED').length;

    const stages = ONBOARDING_STAGES.map((stageName) => ({
      stage_name: stageName,
      tasks: tasks.filter((t: { stage_name: string }) => t.stage_name === stageName),
    }));

    return {
      employee,
      stages,
      progress_percent: total ? Math.round((completed / total) * 100) : 0,
      total_tasks: total,
      completed_tasks: completed,
    };
  }

  async spawnTasksForEmployee(tenantId: string, entityId: number, userId: string) {
    const templates = await this.listTemplates(tenantId, entityId, 'ONBOARDING');
    if (!templates.length) return { spawned: 0 };

    let spawned = 0;
    for (const tpl of templates) {
      const rows = await this.dataSource.query(
        `INSERT INTO hr_employee_onboarding_tasks (tenant_id, entity_id, user_id, template_id, status)
         VALUES ($1,$2,$3,$4,'PENDING')
         ON CONFLICT (user_id, template_id) DO NOTHING
         RETURNING task_id`,
        [tenantId, entityId, userId, tpl.template_id],
      );
      if (rows[0]) spawned += 1;
    }
    return { spawned, total_templates: templates.length };
  }

  async setTaskStatus(taskId: string, completedByUserId: string, completed: boolean) {
    const rows = await this.dataSource.query(
      `UPDATE hr_employee_onboarding_tasks SET
         status = $2,
         completed_at = CASE WHEN $3 THEN NOW() ELSE NULL END,
         completed_by = CASE WHEN $3 THEN $4::uuid ELSE NULL END
       WHERE task_id = $1
       RETURNING *`,
      [taskId, completed ? 'COMPLETED' : 'PENDING', completed, completedByUserId],
    );
    if (!rows[0]) throw new NotFoundException('Onboarding task not found');
    return rows[0];
  }

  async triggerOnHired(tenantId: string, applicantId: string) {
    const [applicant] = await this.dataSource.query<
      Array<{ hired_user_id: string | null; entity_id: number | null }>
    >(
      `SELECT hired_user_id, entity_id FROM hr_applicants WHERE applicant_id = $1 AND tenant_id = $2`,
      [applicantId, tenantId],
    );
    if (!applicant?.hired_user_id) return { spawned: 0, reason: 'no_hired_user' };

    let entityId = applicant.entity_id;
    if (!entityId) {
      const [ent] = await this.dataSource.query<Array<{ entity_id: number }>>(
        `SELECT entity_id FROM org_entities WHERE tenant_id = $1 ORDER BY entity_id LIMIT 1`,
        [tenantId],
      );
      entityId = ent?.entity_id ?? null;
    }
    if (!entityId) return { spawned: 0, reason: 'no_entity' };

    return this.spawnTasksForEmployee(tenantId, entityId, applicant.hired_user_id);
  }
}
