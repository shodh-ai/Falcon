import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { HrAccessControlService } from './hr-access-control.service';

@Injectable()
export class HrWorkflowBuilderService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly accessControl: HrAccessControlService,
  ) {}

  listWorkflows(tenantId: string, entityId: number) {
    return this.dataSource.query(
      `SELECT w.*,
              COALESCE(json_agg(
                json_build_object(
                  'step_id', s.step_id,
                  'step_order', s.step_order,
                  'approver_type', s.approver_type,
                  'approver_ref', s.approver_ref
                ) ORDER BY s.step_order
              ) FILTER (WHERE s.step_id IS NOT NULL), '[]') AS steps
       FROM hr_approval_workflows w
       LEFT JOIN hr_approval_workflow_steps s ON s.workflow_id = w.workflow_id
       WHERE w.tenant_id = $1 AND w.entity_id = $2
       GROUP BY w.workflow_id
       ORDER BY w.workflow_name`,
      [tenantId, entityId],
    );
  }

  async createWorkflow(
    tenantId: string,
    entityId: number,
    dto: {
      action_type: string;
      workflow_name: string;
      steps?: {
        step_order: number;
        approver_type: string;
        approver_ref?: string;
      }[];
    },
  ) {
    const rows = await this.dataSource.query(
      `INSERT INTO hr_approval_workflows (tenant_id, entity_id, action_type, workflow_name)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [tenantId, entityId, dto.action_type, dto.workflow_name],
    );
    const workflowId = rows[0].workflow_id;
    for (const step of dto.steps ?? []) {
      await this.dataSource.query(
        `INSERT INTO hr_approval_workflow_steps (workflow_id, step_order, approver_type, approver_ref)
         VALUES ($1,$2,$3,$4)`,
        [
          workflowId,
          step.step_order,
          step.approver_type,
          step.approver_ref ?? null,
        ],
      );
    }
    return this.getWorkflow(tenantId, entityId, workflowId);
  }

  async getWorkflow(tenantId: string, entityId: number, workflowId: string) {
    const rows = await this.dataSource.query(
      `SELECT w.*,
              COALESCE(json_agg(
                json_build_object(
                  'step_id', s.step_id,
                  'step_order', s.step_order,
                  'approver_type', s.approver_type,
                  'approver_ref', s.approver_ref
                ) ORDER BY s.step_order
              ) FILTER (WHERE s.step_id IS NOT NULL), '[]') AS steps
       FROM hr_approval_workflows w
       LEFT JOIN hr_approval_workflow_steps s ON s.workflow_id = w.workflow_id
       WHERE w.tenant_id = $1 AND w.entity_id = $2 AND w.workflow_id = $3
       GROUP BY w.workflow_id`,
      [tenantId, entityId, workflowId],
    );
    if (!rows[0]) throw new NotFoundException('Workflow not found');
    return rows[0];
  }

  async updateWorkflow(
    tenantId: string,
    entityId: number,
    workflowId: string,
    dto: {
      workflow_name?: string;
      is_active?: boolean;
      steps?: {
        step_order: number;
        approver_type: string;
        approver_ref?: string;
      }[];
    },
  ) {
    await this.dataSource.query(
      `UPDATE hr_approval_workflows SET
         workflow_name = COALESCE($4, workflow_name),
         is_active = COALESCE($5, is_active)
       WHERE tenant_id = $1 AND entity_id = $2 AND workflow_id = $3`,
      [
        tenantId,
        entityId,
        workflowId,
        dto.workflow_name ?? null,
        dto.is_active ?? null,
      ],
    );
    if (dto.steps) {
      await this.dataSource.query(
        `DELETE FROM hr_approval_workflow_steps WHERE workflow_id = $1`,
        [workflowId],
      );
      for (const step of dto.steps) {
        await this.dataSource.query(
          `INSERT INTO hr_approval_workflow_steps (workflow_id, step_order, approver_type, approver_ref)
           VALUES ($1,$2,$3,$4)`,
          [
            workflowId,
            step.step_order,
            step.approver_type,
            step.approver_ref ?? null,
          ],
        );
      }
    }
    return this.getWorkflow(tenantId, entityId, workflowId);
  }

  async deleteWorkflow(tenantId: string, entityId: number, workflowId: string) {
    await this.dataSource.query(
      `DELETE FROM hr_approval_workflow_steps WHERE workflow_id = $1`,
      [workflowId],
    );
    await this.dataSource.query(
      `DELETE FROM hr_approval_workflows WHERE tenant_id = $1 AND entity_id = $2 AND workflow_id = $3`,
      [tenantId, entityId, workflowId],
    );
    return { success: true };
  }

  async resolveNextApprover(
    tenantId: string,
    entityId: number,
    actionType: string,
    requesterUserId: string,
    currentStepOrder: number,
  ): Promise<{
    step_order: number;
    approver_user_id: string | null;
    approver_type: string;
  } | null> {
    const workflows = await this.dataSource.query(
      `SELECT workflow_id FROM hr_approval_workflows
       WHERE tenant_id = $1 AND entity_id = $2 AND action_type = $3 AND is_active = true
       ORDER BY created_at LIMIT 1`,
      [tenantId, entityId, actionType],
    );
    if (!workflows[0]) return null;

    const steps = await this.dataSource.query(
      `SELECT * FROM hr_approval_workflow_steps
       WHERE workflow_id = $1 AND step_order > $2 ORDER BY step_order`,
      [workflows[0].workflow_id, currentStepOrder],
    );
    for (const step of steps) {
      const approverUserId = await this.resolveStepApprover(
        tenantId,
        actionType,
        requesterUserId,
        step,
      );
      // Never leave a request parked on an unassigned or self-approval step.
      // Continue to the next configured approval step instead.
      if (!approverUserId || approverUserId === requesterUserId) continue;

      return {
        step_order: step.step_order,
        approver_user_id: approverUserId,
        approver_type: step.approver_type,
      };
    }

    return null;
  }

  /** Fallback for entities that have not yet published a workflow definition. */
  async resolveDefaultApprover(
    tenantId: string,
    requesterUserId: string,
  ): Promise<string | null> {
    const managerOrHod = await this.dataSource.query(
      `SELECT COALESCE(
          NULLIF(u.reporting_officer_id, $2::uuid),
          NULLIF(d.hod_user_id, $2::uuid)
        ) AS approver_user_id
       FROM users u
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       WHERE u.user_id = $2 AND u.tenant_id = $1
       LIMIT 1`,
      [tenantId, requesterUserId],
    );
    if (managerOrHod[0]?.approver_user_id) {
      return managerOrHod[0].approver_user_id;
    }

    const hrApprover = await this.dataSource.query(
      `SELECT u.user_id
       FROM users u
       LEFT JOIN roles primary_role ON primary_role.role_id = u.role_id
       LEFT JOIN user_roles ur ON ur.user_id = u.user_id
       LEFT JOIN roles secondary_role ON secondary_role.role_id = ur.role_id
       WHERE u.tenant_id = $1
         AND u.is_active = true
         AND u.user_id <> $2
         AND (
           primary_role.role_name IN ('HRAdmin', 'HR')
           OR secondary_role.role_name IN ('HRAdmin', 'HR')
         )
       ORDER BY CASE
         WHEN primary_role.role_name = 'HRAdmin' OR secondary_role.role_name = 'HRAdmin'
         THEN 0 ELSE 1 END, u.created_at
       LIMIT 1`,
      [tenantId, requesterUserId],
    );
    return hrApprover[0]?.user_id ?? null;
  }

  private async resolveStepApprover(
    tenantId: string,
    actionType: string,
    requesterUserId: string,
    step: { approver_type: string; approver_ref?: string | null },
  ): Promise<string | null> {
    if (step.approver_type === 'REPORTING_MANAGER') {
      const rows = await this.dataSource.query(
        `SELECT COALESCE(
            NULLIF(u.reporting_officer_id, $2::uuid),
            NULLIF(d.hod_user_id, $2::uuid)
          ) AS approver_user_id
         FROM users u
         LEFT JOIN departments d ON d.dept_id = u.dept_id
         WHERE u.user_id = $2 AND u.tenant_id = $1
         LIMIT 1`,
        [tenantId, requesterUserId],
      );
      return rows[0]?.approver_user_id ?? null;
    }

    if (step.approver_type === 'DEPT_HEAD') {
      const rows = await this.dataSource.query(
        `SELECT NULLIF(d.hod_user_id, $2::uuid) AS approver_user_id
         FROM users u
         JOIN departments d ON d.dept_id = u.dept_id
         WHERE u.user_id = $2 AND u.tenant_id = $1
         LIMIT 1`,
        [tenantId, requesterUserId],
      );
      return rows[0]?.approver_user_id ?? null;
    }

    if (step.approver_type === 'SPECIFIC_USER') {
      return step.approver_ref ?? null;
    }

    if (step.approver_type === 'ROLE') {
      const roleUser = await this.dataSource.query(
        `SELECT DISTINCT u.user_id
         FROM users u
         LEFT JOIN roles primary_role ON primary_role.role_id = u.role_id
         LEFT JOIN user_roles ur ON ur.user_id = u.user_id
         LEFT JOIN roles secondary_role ON secondary_role.role_id = ur.role_id
         WHERE u.tenant_id = $1
           AND u.is_active = true
           AND u.user_id <> $3
           AND $2 IN (primary_role.role_name, secondary_role.role_name)
         ORDER BY u.user_id
         LIMIT 1`,
        [tenantId, step.approver_ref, requesterUserId],
      );
      return roleUser[0]?.user_id ?? null;
    }

    if (step.approver_type === 'HR_EXECUTIVE') {
      const module = this.accessControl.moduleForActionType(actionType);
      return this.accessControl.resolveHrExecutiveApprover(
        tenantId,
        requesterUserId,
        module,
        step.approver_ref,
      );
    }

    if (step.approver_type === 'HR_ADMIN') {
      return this.accessControl.resolveHrAdminApprover(tenantId);
    }

    return null;
  }
}
