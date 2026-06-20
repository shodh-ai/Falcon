import { Injectable } from '@nestjs/common';
import { NotificationEmitterService } from '../notifications/notification-emitter.service';
import type { FalconNotificationCategory } from '../../entities/falcon-notification.entity';
import type { RoutedApprover } from './workflow-routing.service';
import {
  formatDateRange,
  humanizeRequestType,
} from '../notifications/notification-message.types';

export type WorkflowApprovalNotifyInput = {
  tenantId: string;
  approver: RoutedApprover;
  title: string;
  message: string;
  actionLink: string;
  category?: FalconNotificationCategory;
  requesterUserId?: string;
  requesterName?: string;
  requestType?: string;
  startDate?: string;
  endDate?: string;
};

@Injectable()
export class WorkflowNotificationService {
  constructor(private readonly notify: NotificationEmitterService) {}

  /** Sends in-app notification only to the resolved approver. */
  notifyApprover(input: WorkflowApprovalNotifyInput) {
    const requestLabel = humanizeRequestType(input.requestType ?? input.title);
    const dateRange = formatDateRange(input.startDate, input.endDate);
    const dateSuffix = dateRange ? ` for ${dateRange}` : '';

    const title =
      input.title ||
      (input.requesterName
        ? `${requestLabel} pending — ${input.requesterName}`
        : `${requestLabel} needs your approval`);

    const message =
      input.message ||
      (input.requesterName
        ? `${input.requesterName} submitted a ${requestLabel.toLowerCase()}${dateSuffix} that requires your approval. Open your inbox to review details and approve or reject.`
        : `A ${requestLabel.toLowerCase()}${dateSuffix} is waiting for your approval. Open your inbox to review and take action.`);

    this.notify.approvalRequired({
      tenantId: input.tenantId,
      userId: input.approver.userId,
      title,
      message,
      actionLink: input.actionLink,
      category: input.category ?? 'HR',
      requestType: input.requestType ?? input.title,
      requesterName: input.requesterName,
      routeReason: input.approver.routeReason,
    });
  }
}
