import { Injectable } from '@nestjs/common';
import { NotificationEmitterService } from '../notifications/notification-emitter.service';
import type { FalconNotificationCategory } from '../../entities/falcon-notification.entity';
import type { RoutedApprover } from './workflow-routing.service';

export type WorkflowApprovalNotifyInput = {
  tenantId: string;
  approver: RoutedApprover;
  title: string;
  message: string;
  actionLink: string;
  category?: FalconNotificationCategory;
  requesterUserId?: string;
  requesterName?: string;
};

@Injectable()
export class WorkflowNotificationService {
  constructor(private readonly notify: NotificationEmitterService) {}

  /** Sends in-app notification only to the resolved approver. */
  notifyApprover(input: WorkflowApprovalNotifyInput) {
    this.notify.approvalRequired({
      tenantId: input.tenantId,
      userId: input.approver.userId,
      title: input.title,
      message: input.message,
      actionLink: input.actionLink,
      category: input.category ?? 'HR',
      requestType: input.title,
      requesterName: input.requesterName,
      routeReason: input.approver.routeReason,
    });
  }
}
