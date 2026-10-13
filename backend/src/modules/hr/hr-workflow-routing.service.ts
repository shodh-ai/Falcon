import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import type { StaffRequestType } from '../../entities/staff-leave-request.entity';
import { HrWorkflowBuilderService } from './hr-workflow-builder.service';

export type WorkflowInitResult = {
  workflow_id: string | null;
  step_order: number;
  approver_user_id: string | null;
  approver_type: string | null;
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

  /** Keep the selected workflow locked until the requesting row is committed. */
  async withInitializedRequest<T>(
    tenantId: string,
    entityId: number,
    requestType: StaffRequestType,
    requesterUserId: string,
    persist: (routing: WorkflowInitResult, manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction(async (manager) => {
      const routing = await this.initializeRequest(
        tenantId, entityId, requestType, requesterUserId, manager,
      );
      return persist(routing, manager);
    });
  }

  async initializeRequest(
    tenantId: string,
    entityId: number,
    requestType: StaffRequestType,
    requesterUserId: string,
    manager?: EntityManager,
  ): Promise<WorkflowInitResult> {
    const actionType = this.actionTypeForRequest(requestType);
    const querySource = manager ?? this.dataSource;
    const workflow = await querySource.query(
      `SELECT workflow_id FROM hr_approval_workflows
       WHERE tenant_id = $1 AND entity_id = $2 AND action_type = $3 AND is_active = true
       ORDER BY created_at LIMIT 1${manager ? ' FOR SHARE' : ''}`,
      [tenantId, entityId, actionType],
    );

    if (!workflow[0]) {
      const fallbackManagerId = await this.workflowBuilder.resolveFallbackManager(
        tenantId,
        requesterUserId,
        manager,
      );
      const hrApprover = await this.workflowBuilder.resolveFallbackHrApprover(
        tenantId,
        requesterUserId,
        fallbackManagerId,
        manager,
      );
      if (!hrApprover) {
        throw new BadRequestException(
          'An independent HR approver is not configured. Please contact HR.',
        );
      }
      return {
        workflow_id: null,
        step_order: fallbackManagerId ? 1 : 2,
        approver_user_id: fallbackManagerId ?? hrApprover,
        approver_type: fallbackManagerId ? 'REPORTING_MANAGER' : 'HR_ADMIN',
        is_final: false,
      };
    }

    await this.workflowBuilder.assertWorkflowHasHrTerminal(
      tenantId, entityId, actionType, workflow[0].workflow_id,
      manager,
    );
    const first = await this.workflowBuilder.resolveNextApprover(
      tenantId,
      entityId,
      actionType,
      requesterUserId,
      0,
      workflow[0].workflow_id,
      undefined,
      manager,
    );

    if (!first) {
      throw new BadRequestException(
        'No eligible approver is configured for this request. Please contact HR.',
      );
    }

    return {
      workflow_id: workflow[0].workflow_id,
      step_order: first.step_order,
      approver_user_id: first.approver_user_id,
      approver_type: first.approver_type,
      is_final: false,
    };
  }

  async advanceAfterApproval(
    tenantId: string,
    entityId: number,
    requestType: StaffRequestType,
    requesterUserId: string,
    currentStepOrder: number,
    workflowId: string | null,
    currentApproverUserId?: string | null,
  ): Promise<WorkflowInitResult> {
    if (workflowId === null) {
      if (currentStepOrder === 2) {
        return {
          workflow_id: null,
          step_order: 2,
          approver_user_id: null,
          approver_type: null,
          is_final: true,
        };
      }
      if (currentStepOrder !== 1) {
        throw new BadRequestException('Invalid fallback approval step');
      }
      const hrApprover = await this.workflowBuilder.resolveFallbackHrApprover(
        tenantId,
        requesterUserId,
        currentApproverUserId,
      );
      if (!hrApprover) {
        throw new BadRequestException(
          'An independent HR approver is not configured. Please contact HR.',
        );
      }
      return {
        workflow_id: null,
        step_order: 2,
        approver_user_id: hrApprover,
        approver_type: 'HR_ADMIN',
        is_final: false,
      };
    }

    const actionType = this.actionTypeForRequest(requestType);
    const next = await this.workflowBuilder.resolveNextApprover(
      tenantId,
      entityId,
      actionType,
      requesterUserId,
      currentStepOrder,
      workflowId,
      currentApproverUserId,
    );

    if (!next) {
      await this.workflowBuilder.assertCurrentStepIsFinalHr(
        tenantId, entityId, actionType, workflowId, currentStepOrder,
      );
      return {
        workflow_id: workflowId,
        step_order: currentStepOrder,
        approver_user_id: null,
        approver_type: null,
        is_final: true,
      };
    }

    return {
      workflow_id: workflowId,
      step_order: next.step_order,
      approver_user_id: next.approver_user_id,
      approver_type: next.approver_type,
      is_final: false,
    };
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
