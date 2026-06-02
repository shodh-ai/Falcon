import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  NotificationEvents,
  type AdmitCardLockedPayload,
  type AttendanceWarningPayload,
  type FeeGeneratedPayload,
  type GatePassUpdatedPayload,
  type JobPostedPayload,
  type LeaveApprovedPayload,
  type LibraryOverduePayload,
  type CourseMaterialAddedPayload,
  type MarksPublishedPayload,
  type MeetingRequestedPayload,
  type MeetingRespondedPayload,
  type TicketReplyPayload,
  type TimetableChangedPayload,
  type WorkflowApprovalRequiredPayload,
} from './notification.events';

/** Thin facade so feature modules emit events without importing the listener. */
@Injectable()
export class NotificationEmitterService {
  constructor(private readonly events: EventEmitter2) {}

  feeGenerated(payload: FeeGeneratedPayload) {
    this.events.emit(NotificationEvents.FINANCE_FEE_GENERATED, payload);
  }

  admitCardLocked(payload: AdmitCardLockedPayload) {
    this.events.emit(NotificationEvents.FINANCE_ADMIT_CARD_LOCKED, payload);
  }

  attendanceWarning(payload: AttendanceWarningPayload) {
    this.events.emit(NotificationEvents.ACADEMICS_ATTENDANCE_WARNING, payload);
  }

  timetableChanged(payload: TimetableChangedPayload) {
    this.events.emit(NotificationEvents.ACADEMICS_TIMETABLE_CHANGED, payload);
  }

  marksPublished(payload: MarksPublishedPayload) {
    this.events.emit(NotificationEvents.ACADEMICS_MARKS_PUBLISHED, payload);
  }

  courseMaterialAdded(payload: CourseMaterialAddedPayload) {
    this.events.emit(NotificationEvents.ACADEMICS_COURSE_MATERIAL_ADDED, payload);
  }

  gatePassUpdated(payload: GatePassUpdatedPayload) {
    this.events.emit(NotificationEvents.OPERATIONS_GATE_PASS_UPDATED, payload);
  }

  leaveApproved(payload: LeaveApprovedPayload) {
    this.events.emit(NotificationEvents.HR_LEAVE_APPROVED, payload);
  }

  meetingRequested(payload: MeetingRequestedPayload) {
    this.events.emit(NotificationEvents.ACADEMICS_MEETING_REQUESTED, payload);
  }

  meetingResponded(payload: MeetingRespondedPayload) {
    this.events.emit(NotificationEvents.ACADEMICS_MEETING_RESPONDED, payload);
  }

  jobPosted(payload: JobPostedPayload) {
    this.events.emit(NotificationEvents.PLACEMENT_JOB_POSTED, payload);
  }

  ticketReply(payload: TicketReplyPayload) {
    this.events.emit(NotificationEvents.HELPDESK_TICKET_REPLY, payload);
  }

  libraryOverdue(payload: LibraryOverduePayload) {
    this.events.emit(NotificationEvents.OPERATIONS_LIBRARY_OVERDUE, payload);
  }

  approvalRequired(payload: WorkflowApprovalRequiredPayload) {
    this.events.emit(NotificationEvents.WORKFLOW_APPROVAL_REQUIRED, payload);
  }
}
