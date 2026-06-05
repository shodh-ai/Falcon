import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
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

  async initializeRequest(
    tenantId: string,
    entityId: number,
    requestType: StaffRequestType,
    requesterUserId: string,
  ): Promise<WorkflowInitResult> {
    const actionType = this.actionTypeForRequest(requestType);
    const workflow = await this.dataSource.query(
      `SELECT workflow_id FROM hr_approval_workflows
       WHERE tenant_id = $1 AND entity_id = $2 AND action_type = $3 AND is_active = true
       ORDER BY created_at LIMIT 1`,
      [tenantId, entityId, actionType],
    );

    if (!workflow[0]) {
      return {
        workflow_id: null,
        step_order: 0,
        approver_user_id: null,
        approver_type: null,
        is_final: true,
      };
    }

    const first = await this.workflowBuilder.resolveNextApprover(
      tenantId,
      entityId,
      actionType,
      requesterUserId,
      0,
    );

    if (!first) {
      return {
        workflow_id: workflow[0].workflow_id,
        step_order: 0,
        approver_user_id: null,
        approver_type: null,
        is_final: true,
      };
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
  ): Promise<WorkflowInitResult> {
    const actionType = this.actionTypeForRequest(requestType);
    const next = await this.workflowBuilder.resolveNextApprover(
      tenantId,
      entityId,
      actionType,
      requesterUserId,
      currentStepOrder,
    );

    if (!next) {
      return {
        workflow_id: null,
        step_order: currentStepOrder,
        approver_user_id: null,
        approver_type: null,
        is_final: true,
      };
    }

    return {
      workflow_id: null,
      step_order: next.step_order,
      approver_user_id: next.approver_user_id,
      approver_type: next.approver_type,
      is_final: false,
    };
  }

  assertActorIsCurrentApprover(actorUserId: string, currentApproverUserId: string | null | undefined) {
    if (!currentApproverUserId || currentApproverUserId !== actorUserId) {
      throw new ForbiddenException('You are not the assigned approver for this step');
    }
  }
}
