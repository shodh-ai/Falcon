import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  NOTIFICATION_DELIVERY_QUEUE,
  type NotificationDeliveryJob,
} from '../../common/constants/notification-queue.constants';
import { FalconNotificationsService } from './falcon-notifications.service';
import {
  NotificationEvents,
  type AdmitCardLockedPayload,
  type AttendanceWarningPayload,
  type FeeGeneratedPayload,
  type GatePassUpdatedPayload,
  type JobPostedPayload,
  type LeaveApprovedPayload,
  type LibraryOverduePayload,
  type LibraryReservationReadyPayload,
  type CourseMaterialAddedPayload,
  type MarksPublishedPayload,
  type MeetingRequestedPayload,
  type MeetingRespondedPayload,
  type TicketReplyPayload,
  type TimetableChangedPayload,
  type TransportBusApproachingPayload,
  type WorkflowApprovalRequiredPayload,
  type EventProposedPayload,
  type EventTierPayload,
} from './notification.events';

@Injectable()
export class NotificationEventsListener {
  private readonly logger = new Logger(NotificationEventsListener.name);

  constructor(
    private readonly falconNotifications: FalconNotificationsService,
    @InjectQueue(NOTIFICATION_DELIVERY_QUEUE) private readonly deliveryQueue: Queue,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  private async persistAndQueue(
    input: {
      tenantId: string;
      userId: string;
      category: 'ACADEMICS' | 'FINANCE' | 'HR' | 'EXAMS' | 'HOSTEL' | 'OPERATIONS' | 'PLACEMENT' | 'HELPDESK';
      title: string;
      message: string;
      actionLink?: string;
    },
  ) {
    await this.falconNotifications.create({
      tenantId: input.tenantId,
      userId: input.userId,
      category: input.category,
      title: input.title,
      message: input.message,
      actionLink: input.actionLink,
    });

    const contact = await this.dataSource.query<
      Array<{ official_email: string | null }>
    >(`SELECT official_email FROM users WHERE user_id = $1 LIMIT 1`, [input.userId]);

    const job: NotificationDeliveryJob = {
      tenantId: input.tenantId,
      userId: input.userId,
      category: input.category,
      title: input.title,
      message: input.message,
      email: contact[0]?.official_email ?? null,
    };

    await this.deliveryQueue.add('send-email-whatsapp', job, {
      removeOnComplete: 100,
      removeOnFail: 50,
    });
  }

  @OnEvent(NotificationEvents.FINANCE_FEE_GENERATED)
  async onFeeGenerated(payload: FeeGeneratedPayload) {
    await this.persistAndQueue({
      tenantId: payload.tenantId,
      userId: payload.userId,
      category: 'FINANCE',
      title: payload.title || 'New Fee Demand Generated',
      message:
        payload.message ||
        `A fee of ₹${payload.amount} is due on ${payload.dueDate}.`,
      actionLink: payload.actionLink ?? '/student/finance',
    });
  }

  @OnEvent(NotificationEvents.FINANCE_ADMIT_CARD_LOCKED)
  async onAdmitCardLocked(payload: AdmitCardLockedPayload) {
    await this.persistAndQueue({
      tenantId: payload.tenantId,
      userId: payload.userId,
      category: 'FINANCE',
      title: payload.title || 'Admit Card Locked',
      message:
        payload.message ||
        'Outstanding fee dues detected. Your admit card is locked until payment is cleared.',
      actionLink: payload.actionLink ?? '/student/finance',
    });
  }

  @OnEvent(NotificationEvents.ACADEMICS_ATTENDANCE_WARNING)
  async onAttendanceWarning(payload: AttendanceWarningPayload) {
    await this.persistAndQueue({
      tenantId: payload.tenantId,
      userId: payload.userId,
      category: 'ACADEMICS',
      title: payload.title || 'Attendance Below 75%',
      message:
        payload.message ||
        `Your overall attendance is ${payload.attendancePercent}%. Please attend upcoming classes.`,
      actionLink: payload.actionLink ?? '/student/attendance',
    });
  }

  @OnEvent(NotificationEvents.ACADEMICS_TIMETABLE_CHANGED)
  async onTimetableChanged(payload: TimetableChangedPayload) {
    await this.persistAndQueue({
      tenantId: payload.tenantId,
      userId: payload.userId,
      category: 'ACADEMICS',
      title: payload.title || 'Class Schedule Updated',
      message:
        payload.message ||
        `${payload.courseName}: ${payload.changeSummary}`,
      actionLink: payload.actionLink ?? '/student/timetable',
    });
  }

  @OnEvent(NotificationEvents.ACADEMICS_COURSE_MATERIAL_ADDED)
  async onCourseMaterialAdded(payload: CourseMaterialAddedPayload) {
    await this.persistAndQueue({
      tenantId: payload.tenantId,
      userId: payload.userId,
      category: 'ACADEMICS',
      title: payload.title || 'New study material',
      message:
        payload.message ||
        `New study material "${payload.materialTitle}" added for ${payload.courseName}.`,
      actionLink: payload.actionLink ?? `/student/courses/${payload.courseId}`,
    });
  }

  @OnEvent(NotificationEvents.ACADEMICS_MARKS_PUBLISHED)
  async onMarksPublished(payload: MarksPublishedPayload) {
    await this.persistAndQueue({
      tenantId: payload.tenantId,
      userId: payload.userId,
      category: 'ACADEMICS',
      title: payload.title || 'Marks Published',
      message:
        payload.message ||
        `${payload.examType} marks for ${payload.courseName} are now available.`,
      actionLink: payload.actionLink ?? '/student/grades',
    });
  }

  @OnEvent(NotificationEvents.OPERATIONS_GATE_PASS_UPDATED)
  async onGatePassUpdated(payload: GatePassUpdatedPayload) {
    const approved = payload.status === 'APPROVED';
    await this.persistAndQueue({
      tenantId: payload.tenantId,
      userId: payload.userId,
      category: 'HOSTEL',
      title: payload.title || (approved ? 'Gate Pass Approved' : 'Gate Pass Rejected'),
      message:
        payload.message ||
        (approved
          ? 'Your gate pass has been approved. Show your QR at the gate.'
          : 'Your gate pass request was rejected. Contact the warden for details.'),
      actionLink: payload.actionLink ?? '/student/gate-pass',
    });
  }

  @OnEvent(NotificationEvents.HR_LEAVE_APPROVED)
  async onLeaveApproved(payload: LeaveApprovedPayload) {
    await this.persistAndQueue({
      tenantId: payload.tenantId,
      userId: payload.userId,
      category: 'HR',
      title: payload.title || 'Leave Approved',
      message:
        payload.message ||
        `Your ${payload.leaveType ?? 'leave'} request (${payload.startDate ?? ''} – ${payload.endDate ?? ''}) has been approved by HR.`,
      actionLink: payload.actionLink ?? '/faculty/leaves',
    });
  }

  @OnEvent(NotificationEvents.HR_PENALTY_APPLIED)
  async onPenaltyApplied(payload: LeaveApprovedPayload & { message?: string }) {
    await this.persistAndQueue({
      tenantId: payload.tenantId,
      userId: payload.userId,
      category: 'HR',
      title: payload.title || 'Attendance penalty applied',
      message: payload.message || 'An attendance penalty was applied to your record.',
      actionLink: payload.actionLink ?? '/ess/calendar',
    });
  }

  @OnEvent(NotificationEvents.ACADEMICS_MEETING_REQUESTED)
  async onMeetingRequested(payload: MeetingRequestedPayload) {
    await this.persistAndQueue({
      tenantId: payload.tenantId,
      userId: payload.userId,
      category: 'ACADEMICS',
      title: payload.title || 'Mentorship meeting request',
      message:
        payload.message ||
        `${payload.studentName} (mentee) requested a meeting on ${payload.meetingAt}.`,
      actionLink: payload.actionLink ?? '/faculty/mentorship',
    });
  }

  @OnEvent(NotificationEvents.ACADEMICS_MEETING_RESPONDED)
  async onMeetingResponded(payload: MeetingRespondedPayload) {
    const approved = payload.status === 'APPROVED';
    const when = new Date(payload.meetingAt).toLocaleString();
    await this.persistAndQueue({
      tenantId: payload.tenantId,
      userId: payload.userId,
      category: 'ACADEMICS',
      title:
        payload.title ||
        (approved ? 'Mentorship meeting approved' : 'Mentorship meeting declined'),
      message:
        payload.message ||
        (approved
          ? `Your mentor meeting for ${when} was approved.${payload.remarks ? ` ${payload.remarks}` : ''}`
          : `Your mentor meeting for ${when} was declined.${payload.remarks ? ` Reason: ${payload.remarks}` : ''}`),
      actionLink: payload.actionLink ?? '/student/mentorship',
    });
  }

  @OnEvent(NotificationEvents.PLACEMENT_JOB_POSTED)
  async onJobPosted(payload: JobPostedPayload) {
    await this.persistAndQueue({
      tenantId: payload.tenantId,
      userId: payload.userId,
      category: 'PLACEMENT',
      title: payload.title || 'New Placement Drive',
      message:
        payload.message ||
        `${payload.companyName} is hiring for ${payload.roleTitle}. Apply before the deadline.`,
      actionLink: payload.actionLink ?? '/student/placements',
    });
  }

  @OnEvent(NotificationEvents.HELPDESK_TICKET_REPLY)
  async onTicketReply(payload: TicketReplyPayload) {
    await this.persistAndQueue({
      tenantId: payload.tenantId,
      userId: payload.userId,
      category: 'HELPDESK',
      title: payload.title || 'Helpdesk Reply',
      message: payload.message || `Update on your ticket: ${payload.subject}`,
      actionLink: payload.actionLink ?? `/student/helpdesk/${payload.ticketId}`,
    });
  }

  @OnEvent(NotificationEvents.WORKFLOW_APPROVAL_REQUIRED)
  async onApprovalRequired(payload: WorkflowApprovalRequiredPayload) {
    const category = (payload.category ?? 'HR') as
      | 'ACADEMICS'
      | 'FINANCE'
      | 'HR'
      | 'EXAMS'
      | 'HOSTEL'
      | 'OPERATIONS'
      | 'PLACEMENT'
      | 'HELPDESK';

    await this.persistAndQueue({
      tenantId: payload.tenantId,
      userId: payload.userId,
      category,
      title: payload.title || 'Approval required',
      message:
        payload.message ||
        (payload.requesterName
          ? `${payload.requesterName} submitted ${payload.requestType ?? 'a request'} for your approval.`
          : 'A request is waiting for your approval.'),
      actionLink: payload.actionLink,
    });
  }

  @OnEvent(NotificationEvents.OPERATIONS_LIBRARY_OVERDUE)
  async onLibraryOverdue(payload: LibraryOverduePayload) {
    await this.persistAndQueue({
      tenantId: payload.tenantId,
      userId: payload.userId,
      category: 'OPERATIONS',
      title: payload.title || 'Library Book Overdue',
      message:
        payload.message ||
        `"${payload.bookTitle}" was due on ${payload.dueDate}. Please return it to avoid fines.`,
      actionLink: payload.actionLink ?? '/student/library',
    });
  }

  @OnEvent(NotificationEvents.OPERATIONS_LIBRARY_RESERVATION_READY)
  async onLibraryReservationReady(payload: LibraryReservationReadyPayload) {
    await this.persistAndQueue({
      tenantId: payload.tenantId,
      userId: payload.userId,
      category: 'OPERATIONS',
      title: payload.title || 'Reserved book ready',
      message:
        payload.message ||
        `Your reserved book "${payload.bookTitle}" is ready for pickup at the circulation counter.`,
      actionLink: payload.actionLink ?? '/student/library',
    });
  }

  @OnEvent(NotificationEvents.OPERATIONS_TRANSPORT_BUS_APPROACHING)
  async onTransportBusApproaching(payload: TransportBusApproachingPayload) {
    await this.persistAndQueue({
      tenantId: payload.tenantId,
      userId: payload.userId,
      category: 'OPERATIONS',
      title: payload.title || 'Bus approaching',
      message:
        payload.message ||
        `🚌 Your bus is about ${payload.etaMinutes} minutes away from ${payload.stopName}!`,
      actionLink: payload.actionLink ?? '/student/transport',
    });
  }

  @OnEvent(NotificationEvents.EVENT_PROPOSED)
  async onEventProposed(payload: EventProposedPayload) {
    await this.persistAndQueue({
      tenantId: payload.tenantId,
      userId: payload.userId,
      category: 'OPERATIONS',
      title: payload.title || 'Club event pending approval',
      message:
        payload.message ||
        `${payload.clubName} proposed "${payload.eventTitle}" for your review.`,
      actionLink: payload.actionLink ?? '/faculty/event-approvals',
    });
  }

  @OnEvent(NotificationEvents.EVENT_PENDING_ESTATE)
  async onEventPendingEstate(payload: EventTierPayload) {
    await this.persistAndQueue({
      tenantId: payload.tenantId,
      userId: payload.userId,
      category: 'OPERATIONS',
      title: payload.title || 'Venue approval required',
      message:
        payload.message ||
        `"${payload.eventTitle}" passed faculty review — confirm venue and security.`,
      actionLink: payload.actionLink ?? '/admin-ops/events',
    });
  }

  @OnEvent(NotificationEvents.EVENT_PENDING_FINANCE)
  async onEventPendingFinance(payload: EventTierPayload) {
    await this.persistAndQueue({
      tenantId: payload.tenantId,
      userId: payload.userId,
      category: 'FINANCE',
      title: payload.title || 'Paid event — ledger approval',
      message:
        payload.message ||
        `"${payload.eventTitle}" needs finance sign-off before tickets go live.`,
      actionLink: payload.actionLink ?? '/finance/events',
    });
  }

}
