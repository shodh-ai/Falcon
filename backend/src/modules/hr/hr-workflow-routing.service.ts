import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { StaffRequestType } from '../../entities/staff-leave-request.entity';
import { HrWorkflowBuilderService } from './hr-workflow-builder.service';
import {
  isHrFinalApprovalStage,
  isTwoStageHrRequest,
} from './hr-workforce-approval';

export type WorkflowInitResult = {
  workflow_id: string | null;
  step_order: number;
  approver_user_id: string | null;
  approver_type: string | null;
  approver_ref?: string | null;
  is_final: boolean;
};

@Injectable()
export class HrWorkflowRoutingService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly workflowBuilder: HrWorkflowBuilderService,
  ) {}

  actionTypeForRequest(requestType: StaffRequestType): string {
    const map: Record<StaffRequestType, string> = {
      LEAVE: 'LEAVE',
      ON_DUTY: 'ON_DUTY',
      REGULARIZATION: 'REGULARIZATION',
      COMP_OFF_CREDIT: 'COMP_OFF',
    };
    return map[requestType] ?? requestType;
  }

  async initializeRequest(
    tenantId: string,
    entityId: number,
    requestType: StaffRequestType,
    requesterUserId: string,
  ): Promise<WorkflowInitResult> {
    const actionType = this.actionTypeForRequest(requestType);
    const workflow = await this.dataSource.query<
      Array<{ workflow_id: string }>
    >(
      `SELECT workflow_id FROM hr_approval_workflows
       WHERE tenant_id = $1 AND entity_id = $2 AND action_type = $3 AND is_active = true
       ORDER BY created_at LIMIT 1`,
      [tenantId, entityId, actionType],
    );

    if (!workflow[0] && isTwoStageHrRequest(requestType)) {
      throw new BadRequestException(
        'A two-stage workflow with a final HR approver must be configured before this request can be submitted.',
      );
    }

    if (!workflow[0]) {
      const fallbackApprover =
        await this.workflowBuilder.resolveDefaultApprover(
          tenantId,
          requesterUserId,
        );
      if (!fallbackApprover) {
        throw new BadRequestException(
          'A leave approver is not configured for your department. Please contact HR.',
        );
      }
      return {
        workflow_id: null,
        step_order: 1,
        approver_user_id: fallbackApprover,
        approver_type: 'REPORTING_MANAGER',
        is_final: false,
      };
    }

    const workflowId = workflow[0].workflow_id;
    if (isTwoStageHrRequest(requestType)) {
      await this.assertTwoStageHrWorkflow(tenantId, entityId, workflowId);
    }

    const first = await this.workflowBuilder.resolveNextApprover(
      tenantId,
      entityId,
      actionType,
      requesterUserId,
      0,
      {
        workflowId,
        strict: isTwoStageHrRequest(requestType),
      },
    );

    if (!first) {
      throw new BadRequestException(
        'No eligible approver is configured for this request. Please contact HR.',
      );
    }

    if (isTwoStageHrRequest(requestType)) {
      const finalApprover = await this.workflowBuilder.resolveNextApprover(
        tenantId,
        entityId,
        actionType,
        requesterUserId,
        first.step_order,
        {
          workflowId,
          strict: true,
          excludedApproverUserId: first.approver_user_id,
        },
      );
      if (
        !finalApprover ||
        finalApprover.step_order !== 2 ||
        !isHrFinalApprovalStage(finalApprover)
      ) {
        throw new BadRequestException(
          'A distinct final HR approver must be available before this request can be submitted.',
        );
      }
    }

    return {
      workflow_id: workflowId,
      step_order: first.step_order,
      approver_user_id: first.approver_user_id,
      approver_type: first.approver_type,
      approver_ref: first.approver_ref,
      is_final: false,
    };
  }

  async advanceAfterApproval(
    tenantId: string,
    entityId: number,
    requestType: StaffRequestType,
    requesterUserId: string,
    currentStepOrder: number,
    workflowId?: string | null,
    currentApproverUserId?: string | null,
  ): Promise<WorkflowInitResult> {
    const actionType = this.actionTypeForRequest(requestType);
    if (isTwoStageHrRequest(requestType)) {
      if (!workflowId) {
        throw new BadRequestException(
          'This request has no linked two-stage HR workflow and cannot be approved safely.',
        );
      }
      await this.assertTwoStageHrWorkflow(tenantId, entityId, workflowId);
      if (currentStepOrder === 2) {
        return {
          workflow_id: workflowId,
          step_order: 2,
          approver_user_id: null,
          approver_type: null,
          is_final: true,
        };
      }
      if (currentStepOrder !== 1) {
        throw new BadRequestException(
          'The request is not at a valid approval stage.',
        );
      }
      const nextRequired = await this.workflowBuilder.resolveNextApprover(
        tenantId,
        entityId,
        actionType,
        requesterUserId,
        currentStepOrder,
        {
          workflowId,
          strict: true,
          excludedApproverUserId: currentApproverUserId,
        },
      );
      if (
        !nextRequired ||
        nextRequired.step_order !== 2 ||
        !isHrFinalApprovalStage(nextRequired)
      ) {
        throw new BadRequestException(
          'The configured final HR approver could not be resolved. The request remains pending.',
        );
      }
      return {
        workflow_id: workflowId,
        step_order: nextRequired.step_order,
        approver_user_id: nextRequired.approver_user_id,
        approver_type: nextRequired.approver_type,
        approver_ref: nextRequired.approver_ref,
        is_final: false,
      };
    }

    const next = await this.workflowBuilder.resolveNextApprover(
      tenantId,
      entityId,
      actionType,
      requesterUserId,
      currentStepOrder,
      { workflowId },
    );

    if (!next) {
      return {
        workflow_id: workflowId ?? null,
        step_order: currentStepOrder,
        approver_user_id: null,
        approver_type: null,
        is_final: true,
      };
    }

    return {
      workflow_id: workflowId ?? null,
      step_order: next.step_order,
      approver_user_id: next.approver_user_id,
      approver_type: next.approver_type,
      approver_ref: next.approver_ref,
      is_final: false,
    };
  }

  private async assertTwoStageHrWorkflow(
    tenantId: string,
    entityId: number,
    workflowId: string,
  ): Promise<void> {
    const rows = await this.dataSource.query<
      Array<{
        step_order: number;
        approver_type: string;
        approver_ref: string | null;
      }>
    >(
      `SELECT step_order, approver_type, approver_ref
       FROM hr_approval_workflow_steps steps
       JOIN hr_approval_workflows workflows ON workflows.workflow_id = steps.workflow_id
       WHERE workflows.workflow_id = $1 AND workflows.tenant_id = $2
         AND workflows.entity_id = $3 AND workflows.is_active = true
       ORDER BY step_order`,
      [workflowId, tenantId, entityId],
    );

    if (
      rows.length !== 2 ||
      Number(rows[0]?.step_order) !== 1 ||
      Number(rows[1]?.step_order) !== 2 ||
      isHrFinalApprovalStage(rows[0]) ||
      !isHrFinalApprovalStage(rows[1])
    ) {
      throw new BadRequestException(
        'The active workflow must have one first-level approver followed by a configured final HR approver.',
      );
    }
  }

  async isValidFinalHrStage(
    tenantId: string,
    entityId: number,
    workflowId: string | null,
    stepOrder: number,
  ): Promise<boolean> {
    if (!workflowId || stepOrder !== 2) return false;
    try {
      await this.assertTwoStageHrWorkflow(tenantId, entityId, workflowId);
      return true;
    } catch (error) {
      if (error instanceof BadRequestException) return false;
      throw error;
    }
  }

  assertActorIsCurrentApprover(
    actorUserId: string,
    currentApproverUserId: string | null | undefined,
  ) {
    if (!currentApproverUserId || currentApproverUserId !== actorUserId) {
      throw new ForbiddenException(
        'You are not the assigned approver for this step',
      );
    }
  }
}
