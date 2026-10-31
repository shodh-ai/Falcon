import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { HrAccessControlService } from './hr-access-control.service';
import { configuredReportingOfficer } from '../department-leadership/reporting-officer';

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
    this.assertHrTerminalConfiguration(dto.action_type, dto.steps ?? []);
    const workflowId = await this.dataSource.transaction(async (manager) => {
      const rows = await manager.query(
        `INSERT INTO hr_approval_workflows (tenant_id, entity_id, action_type, workflow_name)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [tenantId, entityId, dto.action_type, dto.workflow_name],
      );
      const createdId = rows[0].workflow_id;
      for (const step of dto.steps ?? []) {
        await manager.query(
          `INSERT INTO hr_approval_workflow_steps (workflow_id, step_order, approver_type, approver_ref)
           VALUES ($1,$2,$3,$4)`,
          [createdId, step.step_order, step.approver_type, step.approver_ref ?? null],
        );
      }
      return createdId;
    });
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
    await this.dataSource.transaction(async (manager) => {
      const workflow = await this.lockWorkflow(manager, tenantId, entityId, workflowId);
      if (dto.steps) {
        await this.assertNoInFlightRequests(manager, tenantId, entityId, workflowId);
        this.assertHrTerminalConfiguration(workflow.action_type, dto.steps);
      }
      await manager.query(
        `UPDATE hr_approval_workflows SET
           workflow_name = COALESCE($4, workflow_name),
           is_active = COALESCE($5, is_active)
         WHERE tenant_id = $1 AND entity_id = $2 AND workflow_id = $3`,
        [tenantId, entityId, workflowId, dto.workflow_name ?? null, dto.is_active ?? null],
      );
      if (dto.steps) {
        await manager.query(
          `DELETE FROM hr_approval_workflow_steps WHERE workflow_id = $1`,
          [workflowId],
        );
        for (const step of dto.steps) {
          await manager.query(
            `INSERT INTO hr_approval_workflow_steps (workflow_id, step_order, approver_type, approver_ref)
             VALUES ($1,$2,$3,$4)`,
            [workflowId, step.step_order, step.approver_type, step.approver_ref ?? null],
          );
        }
      }
    });
    return this.getWorkflow(tenantId, entityId, workflowId);
  }

  async deleteWorkflow(tenantId: string, entityId: number, workflowId: string) {
    await this.dataSource.transaction(async (manager) => {
      await this.lockWorkflow(manager, tenantId, entityId, workflowId);
      await this.assertNoInFlightRequests(manager, tenantId, entityId, workflowId);
      await manager.query(
        `DELETE FROM hr_approval_workflow_steps WHERE workflow_id = $1`,
        [workflowId],
      );
      await manager.query(
        `DELETE FROM hr_approval_workflows WHERE tenant_id = $1 AND entity_id = $2 AND workflow_id = $3`,
        [tenantId, entityId, workflowId],
      );
    });
    return { success: true };
  }

  private async lockWorkflow(
    manager: EntityManager,
    tenantId: string,
    entityId: number,
    workflowId: string,
  ): Promise<{ workflow_id: string; action_type: string }> {
    const rows = await manager.query<Array<{ workflow_id: string; action_type: string }>>(
      `SELECT workflow_id, action_type FROM hr_approval_workflows
       WHERE tenant_id = $1 AND entity_id = $2 AND workflow_id = $3
       FOR UPDATE`,
      [tenantId, entityId, workflowId],
    );
    if (!rows[0]) throw new NotFoundException('Workflow not found');
    return rows[0];
  }

  private async assertNoInFlightRequests(
    manager: EntityManager,
    tenantId: string,
    entityId: number,
    workflowId: string,
  ) {
    const pending = await manager.query<Array<{ leave_id: string }>>(
      `SELECT leave_id FROM staff_leave_requests
       WHERE tenant_id = $1 AND entity_id = $2 AND workflow_id = $3
         AND status IN ('PENDING', 'HOD_APPROVED')
       LIMIT 1`,
      [tenantId, entityId, workflowId],
    );
    if (pending[0]) {
      throw new ConflictException(
        'This workflow has pending requests; create a new workflow version instead',
      );
    }
  }

  private isHrStep(step: { approver_type: string; approver_ref?: string | null }) {
    return step.approver_type === 'HR_ADMIN' ||
      step.approver_type === 'HR_EXECUTIVE' ||
      (step.approver_type === 'ROLE' &&
        ['HR', 'HRAdmin', 'SuperAdmin'].includes(step.approver_ref ?? ''));
  }

  private requiresHrTerminal(actionType: string) {
    return ['LEAVE', 'ON_DUTY', 'REGULARIZATION'].includes(actionType);
  }

  private assertHrTerminalConfiguration(
    actionType: string,
    steps: Array<{ step_order: number; approver_type: string; approver_ref?: string | null }>,
  ) {
    if (!this.requiresHrTerminal(actionType)) return;
    const last = [...steps].sort((a, b) => b.step_order - a.step_order)[0];
    if (!last || !this.isHrStep(last)) {
      throw new BadRequestException('Leave, on-duty and regularization workflows require a final HR approval step');
    }
  }

  /** Refuse new requests under unsafe legacy workflow configuration. */
  async assertWorkflowHasHrTerminal(
    tenantId: string,
    entityId: number,
    actionType: string,
    workflowId: string,
    manager?: EntityManager,
  ) {
    if (!this.requiresHrTerminal(actionType)) return;
    const rows = await (manager ?? this.dataSource).query<Array<{ approver_type: string; approver_ref: string | null }>>(
      `SELECT s.approver_type, s.approver_ref
       FROM hr_approval_workflows w
       JOIN hr_approval_workflow_steps s ON s.workflow_id = w.workflow_id
       WHERE w.tenant_id = $1 AND w.entity_id = $2 AND w.action_type = $3
         AND w.workflow_id = $4
       ORDER BY s.step_order DESC LIMIT 1`,
      [tenantId, entityId, actionType, workflowId],
    );
    if (!rows[0] || !this.isHrStep(rows[0])) {
      throw new BadRequestException('An independent final HR approval step is required before submission');
    }
  }

  /** Prevent a configured non-HR terminal step from finalizing an in-flight request. */
  async assertCurrentStepIsFinalHr(
    tenantId: string,
    entityId: number,
    actionType: string,
    workflowId: string,
    stepOrder: number,
  ) {
    if (!this.requiresHrTerminal(actionType)) return;
    const rows = await this.dataSource.query<Array<{ approver_type: string; approver_ref: string | null }>>(
      `SELECT s.approver_type, s.approver_ref
       FROM hr_approval_workflow_steps s
       JOIN hr_approval_workflows w ON w.workflow_id = s.workflow_id
       WHERE w.tenant_id = $1 AND w.entity_id = $2 AND w.action_type = $3
         AND w.workflow_id = $4 AND s.step_order = $5
         AND NOT EXISTS (
           SELECT 1 FROM hr_approval_workflow_steps later
           WHERE later.workflow_id = s.workflow_id AND later.step_order > s.step_order
         )`,
      [tenantId, entityId, actionType, workflowId, stepOrder],
    );
    if (!rows[0] || !this.isHrStep(rows[0])) {
      throw new BadRequestException('An independent final HR approval step is required before completion');
    }
  }

  async resolveNextApprover(
    tenantId: string,
    entityId: number,
    actionType: string,
    requesterUserId: string,
    currentStepOrder: number,
    pinnedWorkflowId?: string,
    previousApproverId?: string | null,
    manager?: EntityManager,
  ): Promise<{
    step_order: number;
    approver_user_id: string | null;
    approver_type: string;
  } | null> {
    const querySource = manager ?? this.dataSource;
    const workflows = pinnedWorkflowId
      ? await querySource.query(
          `SELECT workflow_id FROM hr_approval_workflows
           WHERE workflow_id = $1 AND tenant_id = $2 AND entity_id = $3 AND action_type = $4`,
          [pinnedWorkflowId, tenantId, entityId, actionType],
        )
      : await querySource.query(
          `SELECT workflow_id FROM hr_approval_workflows
           WHERE tenant_id = $1 AND entity_id = $2 AND action_type = $3 AND is_active = true
           ORDER BY created_at LIMIT 1`,
          [tenantId, entityId, actionType],
        );
    if (!workflows[0]) {
      if (pinnedWorkflowId) {
        throw new BadRequestException('Pinned approval workflow is unavailable');
      }
      return null;
    }

    const steps = await querySource.query(
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
        previousApproverId,
        manager,
      );
      // An explicit HR gate must not vanish just because its approver is
      // absent or would approve their own request.
      const mandatoryHrStep =
        step.approver_type === 'HR_ADMIN' ||
        step.approver_type === 'HR_EXECUTIVE' ||
        (step.approver_type === 'ROLE' &&
          ['HR', 'HRAdmin', 'SuperAdmin'].includes(step.approver_ref ?? ''));
      if (
        mandatoryHrStep &&
        (!approverUserId || approverUserId === requesterUserId ||
          approverUserId === previousApproverId)
      ) {
        throw new BadRequestException(
          'An independent HR approver is not configured for this request',
        );
      }
      // Never leave a request parked on an unassigned or self-approval step.
      // Continue to the next configured approval step instead.
      if (!approverUserId || approverUserId === requesterUserId ||
          approverUserId === previousApproverId) continue;

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
    const manager = await this.resolveFallbackManager(tenantId, requesterUserId);
    if (manager) return manager;
    return this.resolveFallbackHrApprover(tenantId, requesterUserId);
  }

  async resolveFallbackManager(
    tenantId: string,
    requesterUserId: string,
    manager?: EntityManager,
  ): Promise<string | null> {
    const configured=await configuredReportingOfficer((sql,args)=>(manager ?? this.dataSource).query(sql,args),tenantId,requesterUserId);
    if(configured.configured)return configured.officer;
    const managerOrHod = await (manager ?? this.dataSource).query(
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
    return managerOrHod[0]?.approver_user_id ?? null;
  }

  async resolveFallbackHrApprover(
    tenantId: string,
    requesterUserId: string,
    previousApproverId?: string | null,
    manager?: EntityManager,
  ): Promise<string | null> {
    const hrApprover = await (manager ?? this.dataSource).query(
      `SELECT u.user_id
       FROM users u
       LEFT JOIN roles primary_role ON primary_role.role_id = u.role_id
       LEFT JOIN user_roles ur ON ur.user_id = u.user_id
       LEFT JOIN roles secondary_role ON secondary_role.role_id = ur.role_id
       WHERE u.tenant_id = $1
         AND u.is_active = true
         AND u.user_id <> $2
         AND ($3::uuid IS NULL OR u.user_id <> $3)
         AND (
           primary_role.role_name IN ('HRAdmin', 'SuperAdmin')
           OR secondary_role.role_name IN ('HRAdmin', 'SuperAdmin')
         )
       ORDER BY CASE
         WHEN primary_role.role_name = 'HRAdmin' OR secondary_role.role_name = 'HRAdmin'
         THEN 0 ELSE 1 END, u.created_at
       LIMIT 1`,
      [tenantId, requesterUserId, previousApproverId ?? null],
    );
    return hrApprover[0]?.user_id ?? null;
  }

  private async resolveStepApprover(
    tenantId: string,
    actionType: string,
    requesterUserId: string,
    step: { approver_type: string; approver_ref?: string | null },
    previousApproverId?: string | null,
    manager?: EntityManager,
  ): Promise<string | null> {
    const querySource = manager ?? this.dataSource;
    if(step.approver_type==='REPORTING_MANAGER' || step.approver_type==='DEPT_HEAD'){
      const configured=await configuredReportingOfficer((sql,args)=>querySource.query(sql,args),tenantId,requesterUserId);
      if(configured.configured)return configured.officer;
    }
    if (step.approver_type === 'REPORTING_MANAGER') {
      const rows = await querySource.query(
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
      const rows = await querySource.query(
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
      const roleUser = await querySource.query(
        `SELECT DISTINCT u.user_id
         FROM users u
         LEFT JOIN roles primary_role ON primary_role.role_id = u.role_id
         LEFT JOIN user_roles ur ON ur.user_id = u.user_id
         LEFT JOIN roles secondary_role ON secondary_role.role_id = ur.role_id
         WHERE u.tenant_id = $1
           AND u.is_active = true
           AND u.user_id <> $3
           AND ($4::uuid IS NULL OR u.user_id <> $4)
           AND $2 IN (primary_role.role_name, secondary_role.role_name)
         ORDER BY u.user_id
         LIMIT 1`,
        [tenantId, step.approver_ref, requesterUserId, previousApproverId ?? null],
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
        previousApproverId,
        manager,
      );
    }

    if (step.approver_type === 'HR_ADMIN') {
      return this.accessControl.resolveHrAdminApprover(
        tenantId,
        requesterUserId,
        previousApproverId,
        manager,
      );
    }

    return null;
  }
}
