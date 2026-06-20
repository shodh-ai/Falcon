import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificationDispatchService } from './notification-dispatch.service';
import {
  admitCardLockedMessage,
  alumniConversionRequestedMessage,
  attendanceWarningMessage,
  courseMaterialAddedMessage,
  eventPendingEstateMessage,
  eventPendingFinanceMessage,
  eventPendingHodMessage,
  eventPendingDeanMessage,
  eventRejectedMessage,
  eventLiveMessage,
  eventFundsTransferredMessage,
  meetingInvitedMessage,
  meetingRequestedUpwardMessage,
  meetingPortalRespondedMessage,
  meetingAgendaUpdatedMessage,
  meetingMinutesPublishedMessage,
  eventProposedMessage,
  examResultsPublishedMessage,
  examRevaluationAssignedMessage,
  examRevaluationFeePaidMessage,
  examRevaluationPublishedMessage,
  examRevaluationReportReadyMessage,
  exportFailedMessage,
  exportReadyMessage,
  feeGeneratedMessage,
  gatePassUpdatedMessage,
  jobPostedMessage,
  leaveApprovedMessage,
  libraryOverdueMessage,
  libraryReservationReadyMessage,
  marksPublishedMessage,
  meetingRequestedMessage,
  meetingRespondedMessage,
  onboardingCredentialsMessage,
  penaltyAppliedMessage,
  placementStageUpdatedMessage,
  ticketReplyMessage,
  timetableChangedMessage,
  transportBusApproachingMessage,
  workflowApprovalRequiredMessage,
  ecellStatusUpdatedMessage,
  ecellMentorMeetingRequestedMessage,
  ecellMentorMeetingRespondedMessage,
  ecellMentorFeedbackRequestedMessage,
} from './notification-message.catalog';
import {
  NotificationEvents,
  type AdmitCardLockedPayload,
  type AttendanceWarningPayload,
  type FeeGeneratedPayload,
  type GatePassUpdatedPayload,
  type JobPostedPayload,
  type PlacementStageUpdatedPayload,
  type LeaveApprovedPayload,
  type LibraryOverduePayload,
  type LibraryReservationReadyPayload,
  type CourseMaterialAddedPayload,
  type ExamRevaluationPayload,
  type MarksPublishedPayload,
  type MeetingRequestedPayload,
  type MeetingRespondedPayload,
  type TicketReplyPayload,
  type TimetableChangedPayload,
  type TransportBusApproachingPayload,
  type WorkflowApprovalRequiredPayload,
  type EventProposedPayload,
  type EventTierPayload,
  type EventRejectedPayload,
  type EventLivePayload,
  type EventFundsTransferredPayload,
  type MeetingPortalPayload,
  type OnboardingCredentialsPayload,
  type HrExportReadyPayload,
  type HrExportFailedPayload,
  type AlumniConversionRequestedPayload,
  type EcellStatusUpdatedPayload,
  type EcellMentorMeetingRequestedPayload,
  type EcellMentorMeetingRespondedPayload,
  type EcellMentorFeedbackRequestedPayload,
} from './notification.events';

@Injectable()
export class NotificationEventsListener {
  constructor(
    private readonly dispatch: NotificationDispatchService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  private async emitFromPayload(
    tenantId: string,
    userId: string,
    message: ReturnType<typeof feeGeneratedMessage>,
    overrides?: { title?: string; message?: string; actionLink?: string },
    options?: { queueDelivery?: boolean },
  ) {
    await this.dispatch.dispatch({
      tenantId,
      userId,
      ...message,
      title: overrides?.title ?? message.title,
      message: overrides?.message ?? message.message,
      actionLink: overrides?.actionLink ?? message.actionLink,
      queueDelivery: options?.queueDelivery,
    });
  }

  @OnEvent(NotificationEvents.FINANCE_FEE_GENERATED)
  async onFeeGenerated(payload: FeeGeneratedPayload) {
    const msg = feeGeneratedMessage(payload, {
      title: payload.title,
      message: payload.message,
      actionLink: payload.actionLink,
    });
    await this.emitFromPayload(payload.tenantId, payload.userId, msg);
  }

  @OnEvent(NotificationEvents.FINANCE_ADMIT_CARD_LOCKED)
  async onAdmitCardLocked(payload: AdmitCardLockedPayload) {
    const msg = admitCardLockedMessage(payload, {
      title: payload.title,
      message: payload.message,
      actionLink: payload.actionLink,
    });
    await this.emitFromPayload(payload.tenantId, payload.userId, msg);
  }

  @OnEvent(NotificationEvents.ACADEMICS_ATTENDANCE_WARNING)
  async onAttendanceWarning(payload: AttendanceWarningPayload) {
    const msg = attendanceWarningMessage(payload, {
      title: payload.title,
      message: payload.message,
      actionLink: payload.actionLink,
    });
    await this.emitFromPayload(payload.tenantId, payload.userId, msg);
  }

  @OnEvent(NotificationEvents.ACADEMICS_TIMETABLE_CHANGED)
  async onTimetableChanged(payload: TimetableChangedPayload) {
    const msg = timetableChangedMessage(payload, {
      title: payload.title,
      message: payload.message,
      actionLink: payload.actionLink,
    });
    await this.emitFromPayload(payload.tenantId, payload.userId, msg);
  }

  @OnEvent(NotificationEvents.ACADEMICS_COURSE_MATERIAL_ADDED)
  async onCourseMaterialAdded(payload: CourseMaterialAddedPayload) {
    const msg = courseMaterialAddedMessage(payload, {
      title: payload.title,
      message: payload.message,
      actionLink: payload.actionLink,
    });
    await this.emitFromPayload(payload.tenantId, payload.userId, msg);
  }

  @OnEvent(NotificationEvents.ACADEMICS_MARKS_PUBLISHED)
  async onMarksPublished(payload: MarksPublishedPayload) {
    const msg = marksPublishedMessage(payload, {
      title: payload.title,
      message: payload.message,
      actionLink: payload.actionLink,
    });
    await this.emitFromPayload(payload.tenantId, payload.userId, msg);
  }

  @OnEvent(NotificationEvents.EXAM_RESULTS_PUBLISHED)
  async onExamResultsPublished(payload: MarksPublishedPayload) {
    const msg = examResultsPublishedMessage(payload, {
      title: payload.title,
      message: payload.message,
      actionLink: payload.actionLink,
    });
    await this.emitFromPayload(payload.tenantId, payload.userId, msg);
  }

  @OnEvent(NotificationEvents.EXAM_REVALUATION_ASSIGNED)
  async onExamRevaluationAssigned(payload: ExamRevaluationPayload) {
    const msg = examRevaluationAssignedMessage(payload, {
      title: payload.title,
      message: payload.message,
      actionLink: payload.actionLink,
    });
    await this.emitFromPayload(payload.tenantId, payload.userId, msg);
  }

  @OnEvent(NotificationEvents.EXAM_REVALUATION_REPORT_READY)
  async onExamRevaluationReportReady(payload: ExamRevaluationPayload) {
    const recipients = await this.listExamCellOfficers(payload.tenantId);
    const msg = examRevaluationReportReadyMessage(payload);
    for (const userId of recipients) {
      await this.emitFromPayload(payload.tenantId, userId, msg);
    }
  }

  @OnEvent(NotificationEvents.EXAM_REVALUATION_FEE_PAID)
  async onExamRevaluationFeePaid(payload: ExamRevaluationPayload) {
    const recipients = await this.listExamCellOfficers(payload.tenantId);
    const msg = examRevaluationFeePaidMessage(payload);
    for (const userId of recipients) {
      await this.emitFromPayload(payload.tenantId, userId, msg);
    }
  }

  @OnEvent(NotificationEvents.EXAM_REVALUATION_PUBLISHED)
  async onExamRevaluationPublished(payload: ExamRevaluationPayload) {
    const msg = examRevaluationPublishedMessage(payload, {
      title: payload.title,
      message: payload.message,
      actionLink: payload.actionLink,
    });
    await this.emitFromPayload(payload.tenantId, payload.userId, msg);
  }

  private async listExamCellOfficers(tenantId: string) {
    const rows = await this.dataSource.query<Array<{ user_id: string }>>(
      `SELECT DISTINCT u.user_id
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.user_id
       JOIN roles r ON r.role_id = ur.role_id
       WHERE u.tenant_id = $1
         AND u.is_active = true
         AND lower(r.role_name) IN ('examcell', 'superadmin')`,
      [tenantId],
    );
    return rows.map((row) => row.user_id);
  }

  @OnEvent(NotificationEvents.OPERATIONS_GATE_PASS_UPDATED)
  async onGatePassUpdated(payload: GatePassUpdatedPayload) {
    const msg = gatePassUpdatedMessage(payload, {
      title: payload.title,
      message: payload.message,
      actionLink: payload.actionLink,
    });
    await this.emitFromPayload(payload.tenantId, payload.userId, msg);
  }

  @OnEvent(NotificationEvents.HR_LEAVE_APPROVED)
  async onLeaveApproved(payload: LeaveApprovedPayload) {
    const msg = leaveApprovedMessage(payload, {
      title: payload.title,
      message: payload.message,
      actionLink: payload.actionLink,
    });
    await this.emitFromPayload(payload.tenantId, payload.userId, msg);
  }

  @OnEvent(NotificationEvents.HR_PENALTY_APPLIED)
  async onPenaltyApplied(payload: LeaveApprovedPayload & { message?: string }) {
    const msg = penaltyAppliedMessage(payload, {
      title: payload.title,
      message: payload.message,
      actionLink: payload.actionLink,
    });
    await this.emitFromPayload(payload.tenantId, payload.userId, msg);
  }

  @OnEvent(NotificationEvents.ACADEMICS_MEETING_REQUESTED)
  async onMeetingRequested(payload: MeetingRequestedPayload) {
    const msg = meetingRequestedMessage(payload, {
      title: payload.title,
      message: payload.message,
      actionLink: payload.actionLink,
    });
    await this.emitFromPayload(payload.tenantId, payload.userId, msg);
  }

  @OnEvent(NotificationEvents.ACADEMICS_MEETING_RESPONDED)
  async onMeetingResponded(payload: MeetingRespondedPayload) {
    const msg = meetingRespondedMessage(payload, {
      title: payload.title,
      message: payload.message,
      actionLink: payload.actionLink,
    });
    await this.emitFromPayload(payload.tenantId, payload.userId, msg);
  }

  @OnEvent(NotificationEvents.PLACEMENT_JOB_POSTED)
  async onJobPosted(payload: JobPostedPayload) {
    const msg = jobPostedMessage(payload, {
      title: payload.title,
      message: payload.message,
      actionLink: payload.actionLink,
    });
    await this.emitFromPayload(payload.tenantId, payload.userId, msg);
  }

  @OnEvent(NotificationEvents.PLACEMENT_STAGE_UPDATED)
  async onPlacementStageUpdated(payload: PlacementStageUpdatedPayload) {
    const msg = placementStageUpdatedMessage(payload, {
      title: payload.title,
      message: payload.message,
      actionLink: payload.actionLink,
    });
    await this.emitFromPayload(payload.tenantId, payload.userId, msg);
  }

  @OnEvent(NotificationEvents.HELPDESK_TICKET_REPLY)
  async onTicketReply(payload: TicketReplyPayload) {
    const msg = ticketReplyMessage(payload, {
      title: payload.title,
      message: payload.message,
      actionLink: payload.actionLink,
    });
    await this.emitFromPayload(payload.tenantId, payload.userId, msg);
  }

  @OnEvent(NotificationEvents.WORKFLOW_APPROVAL_REQUIRED)
  async onApprovalRequired(payload: WorkflowApprovalRequiredPayload) {
    const msg = workflowApprovalRequiredMessage(payload, {
      title: payload.title,
      message: payload.message,
      actionLink: payload.actionLink,
    });
    await this.emitFromPayload(payload.tenantId, payload.userId, msg);
  }

  @OnEvent(NotificationEvents.OPERATIONS_LIBRARY_OVERDUE)
  async onLibraryOverdue(payload: LibraryOverduePayload) {
    const msg = libraryOverdueMessage(payload, {
      title: payload.title,
      message: payload.message,
      actionLink: payload.actionLink,
    });
    await this.emitFromPayload(payload.tenantId, payload.userId, msg);
  }

  @OnEvent(NotificationEvents.OPERATIONS_LIBRARY_RESERVATION_READY)
  async onLibraryReservationReady(payload: LibraryReservationReadyPayload) {
    const msg = libraryReservationReadyMessage(payload, {
      title: payload.title,
      message: payload.message,
      actionLink: payload.actionLink,
    });
    await this.emitFromPayload(payload.tenantId, payload.userId, msg);
  }

  @OnEvent(NotificationEvents.OPERATIONS_TRANSPORT_BUS_APPROACHING)
  async onTransportBusApproaching(payload: TransportBusApproachingPayload) {
    const msg = transportBusApproachingMessage(payload, {
      title: payload.title,
      message: payload.message,
      actionLink: payload.actionLink,
    });
    await this.emitFromPayload(payload.tenantId, payload.userId, msg);
  }

  @OnEvent(NotificationEvents.EVENT_PROPOSED)
  async onEventProposed(payload: EventProposedPayload) {
    const msg = eventProposedMessage(payload, {
      title: payload.title,
      message: payload.message,
      actionLink: payload.actionLink,
    });
    await this.emitFromPayload(payload.tenantId, payload.userId, msg);
  }

  @OnEvent(NotificationEvents.EVENT_PENDING_HOD)
  async onEventPendingHod(payload: EventTierPayload) {
    const msg = eventPendingHodMessage(payload, {
      title: payload.title,
      message: payload.message,
      actionLink: payload.actionLink,
    });
    await this.emitFromPayload(payload.tenantId, payload.userId, msg);
  }

  @OnEvent(NotificationEvents.EVENT_PENDING_DEAN)
  async onEventPendingDean(payload: EventTierPayload) {
    const msg = eventPendingDeanMessage(payload, {
      title: payload.title,
      message: payload.message,
      actionLink: payload.actionLink,
    });
    await this.emitFromPayload(payload.tenantId, payload.userId, msg);
  }

  @OnEvent(NotificationEvents.EVENT_PENDING_ESTATE)
  async onEventPendingEstate(payload: EventTierPayload) {
    const msg = eventPendingEstateMessage(payload, {
      title: payload.title,
      message: payload.message,
      actionLink: payload.actionLink,
    });
    await this.emitFromPayload(payload.tenantId, payload.userId, msg);
  }

  @OnEvent(NotificationEvents.EVENT_PENDING_FINANCE)
  async onEventPendingFinance(payload: EventTierPayload) {
    const msg = eventPendingFinanceMessage(payload, {
      title: payload.title,
      message: payload.message,
      actionLink: payload.actionLink,
    });
    await this.emitFromPayload(payload.tenantId, payload.userId, msg);
  }

  @OnEvent(NotificationEvents.EVENT_REJECTED)
  async onEventRejected(payload: EventRejectedPayload) {
    const msg = eventRejectedMessage(payload, {
      title: payload.title,
      message: payload.message,
      actionLink: payload.actionLink,
    });
    await this.emitFromPayload(payload.tenantId, payload.userId, msg);
  }

  @OnEvent(NotificationEvents.EVENT_LIVE)
  async onEventLive(payload: EventLivePayload) {
    const msg = eventLiveMessage(payload, {
      title: payload.title,
      message: payload.message,
      actionLink: payload.actionLink,
    });
    await this.emitFromPayload(payload.tenantId, payload.userId, msg);
  }

  @OnEvent(NotificationEvents.EVENT_FUNDS_TRANSFERRED)
  async onEventFundsTransferred(payload: EventFundsTransferredPayload) {
    const msg = eventFundsTransferredMessage(payload, {
      title: payload.title,
      message: payload.message,
      actionLink: payload.actionLink,
    });
    await this.emitFromPayload(payload.tenantId, payload.userId, msg);
  }

  @OnEvent(NotificationEvents.MEETING_INVITED)
  async onMeetingInvited(payload: MeetingPortalPayload) {
    const msg = meetingInvitedMessage(payload, {
      title: payload.title,
      message: payload.message,
      actionLink: payload.actionLink,
    });
    await this.emitFromPayload(payload.tenantId, payload.userId, msg);
  }

  @OnEvent(NotificationEvents.MEETING_REQUESTED_UPWARD)
  async onMeetingRequestedUpward(payload: MeetingPortalPayload) {
    const msg = meetingRequestedUpwardMessage(payload, {
      title: payload.title,
      message: payload.message,
      actionLink: payload.actionLink,
    });
    await this.emitFromPayload(payload.tenantId, payload.userId, msg);
  }

  @OnEvent(NotificationEvents.MEETING_RESPONDED)
  async onPortalMeetingResponded(payload: MeetingPortalPayload) {
    const msg = meetingPortalRespondedMessage(payload, {
      title: payload.title,
      message: payload.message,
      actionLink: payload.actionLink,
    });
    await this.emitFromPayload(payload.tenantId, payload.userId, msg);
  }

  @OnEvent(NotificationEvents.MEETING_AGENDA_UPDATED)
  async onMeetingAgendaUpdated(payload: MeetingPortalPayload) {
    const msg = meetingAgendaUpdatedMessage(payload, {
      title: payload.title,
      message: payload.message,
      actionLink: payload.actionLink,
    });
    await this.emitFromPayload(payload.tenantId, payload.userId, msg);
  }

  @OnEvent(NotificationEvents.MEETING_MINUTES_PUBLISHED)
  async onMeetingMinutesPublished(payload: MeetingPortalPayload) {
    const msg = meetingMinutesPublishedMessage(payload, {
      title: payload.title,
      message: payload.message,
      actionLink: payload.actionLink,
    });
    await this.emitFromPayload(payload.tenantId, payload.userId, msg);
  }

  @OnEvent(NotificationEvents.HR_ONBOARDING_CREDENTIALS)
  async onOnboardingCredentials(payload: OnboardingCredentialsPayload) {
    const msg = onboardingCredentialsMessage(payload, {
      title: payload.title,
      message: payload.message,
      actionLink: payload.actionLink,
    });
    await this.emitFromPayload(payload.tenantId, payload.userId, msg);
  }

  @OnEvent(NotificationEvents.HR_EXPORT_READY)
  async onExportReady(payload: HrExportReadyPayload) {
    const msg = exportReadyMessage(payload, {
      title: payload.title,
      message: payload.message,
      actionLink: payload.actionLink ?? payload.zipUrl,
    });
    await this.emitFromPayload(payload.tenantId, payload.userId, msg);
  }

  @OnEvent(NotificationEvents.HR_EXPORT_FAILED)
  async onExportFailed(payload: HrExportFailedPayload) {
    const msg = exportFailedMessage(payload, {
      title: payload.title,
      message: payload.message,
      actionLink: payload.actionLink,
    });
    await this.emitFromPayload(payload.tenantId, payload.userId, msg);
  }

  @OnEvent(NotificationEvents.ECELL_STATUS_UPDATED)
  async onEcellStatusUpdated(payload: EcellStatusUpdatedPayload) {
    const msg = ecellStatusUpdatedMessage(payload, {
      title: payload.title,
      message: payload.message,
      actionLink: payload.actionLink,
    });
    await this.emitFromPayload(payload.tenantId, payload.userId, msg);
  }

  @OnEvent(NotificationEvents.ECELL_MENTOR_MEETING_REQUESTED)
  async onEcellMentorMeetingRequested(payload: EcellMentorMeetingRequestedPayload) {
    const msg = ecellMentorMeetingRequestedMessage(payload, {
      actionLink: payload.actionLink,
    });
    await this.emitFromPayload(payload.tenantId, payload.userId, msg);
  }

  @OnEvent(NotificationEvents.ECELL_MENTOR_MEETING_RESPONDED)
  async onEcellMentorMeetingResponded(payload: EcellMentorMeetingRespondedPayload) {
    const msg = ecellMentorMeetingRespondedMessage(payload, {
      actionLink: payload.actionLink,
    });
    await this.emitFromPayload(payload.tenantId, payload.userId, msg);
  }

  @OnEvent(NotificationEvents.ECELL_MENTOR_FEEDBACK_REQUESTED)
  async onEcellMentorFeedbackRequested(payload: EcellMentorFeedbackRequestedPayload) {
    const msg = ecellMentorFeedbackRequestedMessage(payload, {
      actionLink: payload.actionLink,
    });
    await this.emitFromPayload(payload.tenantId, payload.userId, msg);
  }

  @OnEvent(NotificationEvents.ALUMNI_CONVERSION_REQUESTED)
  async onAlumniConversionRequested(payload: AlumniConversionRequestedPayload) {
    const officers = await this.dataSource.query<Array<{ user_id: string }>>(
      `SELECT u.user_id
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1 AND u.is_active = true
         AND r.role_name IN ('IQAC', 'Registrar')`,
      [payload.tenantId],
    );

    const msg = alumniConversionRequestedMessage(payload);
    await this.dispatch.dispatchToMany(
      payload.tenantId,
      officers.map((o) => o.user_id),
      msg,
      { queueDelivery: false },
    );
  }
}
