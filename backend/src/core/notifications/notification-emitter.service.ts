import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
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
  type ExamResultsPublishedPayload,
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
  type AlumniWelcomeEmailPayload,
  type AlumniConversionApprovedPayload,
  type StudentOnboardingApprovedPayload,
  type EcellStatusUpdatedPayload,
  type EcellMentorMeetingRequestedPayload,
  type EcellMentorMeetingRespondedPayload,
  type EcellMentorFeedbackRequestedPayload,
  type VenueBookingPayload,
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

  examResultsPublished(payload: ExamResultsPublishedPayload) {
    this.events.emit(NotificationEvents.EXAM_RESULTS_PUBLISHED, payload);
  }

  examRevaluationAssigned(payload: ExamRevaluationPayload) {
    this.events.emit(NotificationEvents.EXAM_REVALUATION_ASSIGNED, payload);
  }

  examRevaluationReportReady(payload: ExamRevaluationPayload) {
    this.events.emit(NotificationEvents.EXAM_REVALUATION_REPORT_READY, payload);
  }

  examRevaluationPublished(payload: ExamRevaluationPayload) {
    this.events.emit(NotificationEvents.EXAM_REVALUATION_PUBLISHED, payload);
  }

  examRevaluationFeePaid(payload: ExamRevaluationPayload) {
    this.events.emit(NotificationEvents.EXAM_REVALUATION_FEE_PAID, payload);
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

  penaltyApplied(payload: LeaveApprovedPayload & { message?: string }) {
    this.events.emit(NotificationEvents.HR_PENALTY_APPLIED, payload);
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

  placementStageUpdated(payload: PlacementStageUpdatedPayload) {
    this.events.emit(NotificationEvents.PLACEMENT_STAGE_UPDATED, payload);
  }

  ticketReply(payload: TicketReplyPayload) {
    this.events.emit(NotificationEvents.HELPDESK_TICKET_REPLY, payload);
  }

  libraryOverdue(payload: LibraryOverduePayload) {
    this.events.emit(NotificationEvents.OPERATIONS_LIBRARY_OVERDUE, payload);
  }

  reservationReady(payload: LibraryReservationReadyPayload) {
    this.events.emit(NotificationEvents.OPERATIONS_LIBRARY_RESERVATION_READY, payload);
  }

  busApproaching(payload: TransportBusApproachingPayload) {
    this.events.emit(NotificationEvents.OPERATIONS_TRANSPORT_BUS_APPROACHING, payload);
  }

  approvalRequired(payload: WorkflowApprovalRequiredPayload) {
    this.events.emit(NotificationEvents.WORKFLOW_APPROVAL_REQUIRED, payload);
  }

  eventProposed(payload: EventProposedPayload) {
    this.events.emit(NotificationEvents.EVENT_PROPOSED, payload);
  }

  eventPendingHod(payload: EventTierPayload) {
    this.events.emit(NotificationEvents.EVENT_PENDING_HOD, payload);
  }

  eventPendingDean(payload: EventTierPayload) {
    this.events.emit(NotificationEvents.EVENT_PENDING_DEAN, payload);
  }

  eventPendingEstate(payload: EventTierPayload) {
    this.events.emit(NotificationEvents.EVENT_PENDING_ESTATE, payload);
  }

  eventPendingFinance(payload: EventTierPayload) {
    this.events.emit(NotificationEvents.EVENT_PENDING_FINANCE, payload);
  }

  eventRejected(payload: EventRejectedPayload) {
    this.events.emit(NotificationEvents.EVENT_REJECTED, payload);
  }

  eventLive(payload: EventLivePayload) {
    this.events.emit(NotificationEvents.EVENT_LIVE, payload);
  }

  eventFundsTransferred(payload: EventFundsTransferredPayload) {
    this.events.emit(NotificationEvents.EVENT_FUNDS_TRANSFERRED, payload);
  }

  meetingInvited(payload: MeetingPortalPayload) {
    this.events.emit(NotificationEvents.MEETING_INVITED, payload);
  }

  meetingRequestedUpward(payload: MeetingPortalPayload) {
    this.events.emit(NotificationEvents.MEETING_REQUESTED_UPWARD, payload);
  }

  portalMeetingResponded(payload: MeetingPortalPayload) {
    this.events.emit(NotificationEvents.MEETING_RESPONDED, payload);
  }

  meetingAgendaUpdated(payload: MeetingPortalPayload) {
    this.events.emit(NotificationEvents.MEETING_AGENDA_UPDATED, payload);
  }

  meetingMinutesPublished(payload: MeetingPortalPayload) {
    this.events.emit(NotificationEvents.MEETING_MINUTES_PUBLISHED, payload);
  }

  onboardingCredentials(payload: OnboardingCredentialsPayload) {
    this.events.emit(NotificationEvents.HR_ONBOARDING_CREDENTIALS, payload);
  }

  exportReady(payload: HrExportReadyPayload) {
    this.events.emit(NotificationEvents.HR_EXPORT_READY, payload);
  }

  exportFailed(payload: HrExportFailedPayload) {
    this.events.emit(NotificationEvents.HR_EXPORT_FAILED, payload);
  }

  alumniConversionRequested(payload: AlumniConversionRequestedPayload) {
    this.events.emit(NotificationEvents.ALUMNI_CONVERSION_REQUESTED, payload);
  }

  alumniWelcomeEmail(payload: AlumniWelcomeEmailPayload) {
    this.events.emit(NotificationEvents.ALUMNI_WELCOME_EMAIL, payload);
  }

  alumniConversionApproved(payload: AlumniConversionApprovedPayload) {
    this.events.emit(NotificationEvents.ALUMNI_CONVERSION_APPROVED, payload);
  }

  studentOnboardingApproved(payload: StudentOnboardingApprovedPayload) {
    this.events.emit(NotificationEvents.STUDENT_ONBOARDING_APPROVED, payload);
  }

  ecellStatusUpdated(payload: EcellStatusUpdatedPayload) {
    this.events.emit(NotificationEvents.ECELL_STATUS_UPDATED, payload);
  }

  ecellMentorMeetingRequested(payload: EcellMentorMeetingRequestedPayload) {
    this.events.emit(NotificationEvents.ECELL_MENTOR_MEETING_REQUESTED, payload);
  }

  ecellMentorMeetingResponded(payload: EcellMentorMeetingRespondedPayload) {
    this.events.emit(NotificationEvents.ECELL_MENTOR_MEETING_RESPONDED, payload);
  }

  ecellMentorFeedbackRequested(payload: EcellMentorFeedbackRequestedPayload) {
    this.events.emit(NotificationEvents.ECELL_MENTOR_FEEDBACK_REQUESTED, payload);
  }

  venueBookingPendingApproval(payload: VenueBookingPayload) {
    this.events.emit(NotificationEvents.VENUE_BOOKING_PENDING_APPROVAL, payload);
  }

  venueBookingApproved(payload: VenueBookingPayload) {
    this.events.emit(NotificationEvents.VENUE_BOOKING_APPROVED, payload);
  }

  venueBookingRejected(payload: VenueBookingPayload) {
    this.events.emit(NotificationEvents.VENUE_BOOKING_REJECTED, payload);
  }
}
