export const NotificationEvents = {
  FINANCE_FEE_GENERATED: 'finance.fee_generated',
  FINANCE_ADMIT_CARD_LOCKED: 'finance.admit_card_locked',
  EXAM_RESULTS_PUBLISHED: 'exam.results_published',
  ACADEMICS_ATTENDANCE_WARNING: 'academics.attendance_warning',
  ACADEMICS_TIMETABLE_CHANGED: 'academics.timetable_changed',
  ACADEMICS_MARKS_PUBLISHED: 'academics.marks_published',
  ACADEMICS_COURSE_MATERIAL_ADDED: 'academics.course_material_added',
  OPERATIONS_GATE_PASS_UPDATED: 'operations.gate_pass_updated',
  HR_LEAVE_APPROVED: 'hr.leave_approved',
  HR_PENALTY_APPLIED: 'hr.penalty_applied',
  ACADEMICS_MEETING_REQUESTED: 'academics.meeting_requested',
  ACADEMICS_MEETING_RESPONDED: 'academics.meeting_responded',
  PLACEMENT_JOB_POSTED: 'placement.job_posted',
  PLACEMENT_STAGE_UPDATED: 'placement.stage_updated',
  HELPDESK_TICKET_REPLY: 'helpdesk.ticket_reply',
  OPERATIONS_LIBRARY_OVERDUE: 'operations.library_overdue',
  OPERATIONS_LIBRARY_RESERVATION_READY: 'operations.library_reservation_ready',
  OPERATIONS_TRANSPORT_BUS_APPROACHING: 'operations.transport_bus_approaching',
  WORKFLOW_APPROVAL_REQUIRED: 'workflow.approval_required',
  EVENT_PROPOSED: 'event.proposed',
  EVENT_PENDING_ESTATE: 'event.pending_estate',
  EVENT_PENDING_FINANCE: 'event.pending_finance',
  HR_ONBOARDING_CREDENTIALS: 'hr.onboarding_credentials',
  HR_EXPORT_READY: 'hr.export_ready',
  HR_EXPORT_FAILED: 'hr.export_failed',
  ALUMNI_CONVERSION_REQUESTED: 'alumni.conversion_requested',
  ALUMNI_CONVERSION_APPROVED: 'alumni.conversion_approved',
  ALUMNI_WELCOME_EMAIL: 'alumni.welcome_email',
} as const;

export type NotificationEventName =
  (typeof NotificationEvents)[keyof typeof NotificationEvents];

export type BaseNotificationPayload = {
  tenantId: string;
  userId: string;
  title?: string;
  message?: string;
  actionLink?: string;
};

export type FeeGeneratedPayload = BaseNotificationPayload & {
  amount: number;
  dueDate: string;
  feeHead?: string;
};

export type AdmitCardLockedPayload = BaseNotificationPayload;

export type AttendanceWarningPayload = BaseNotificationPayload & {
  attendancePercent: number;
};

export type TimetableChangedPayload = BaseNotificationPayload & {
  courseName: string;
  changeSummary: string;
};

export type MarksPublishedPayload = BaseNotificationPayload & {
  courseName: string;
  examType: string;
};

export type ExamResultsPublishedPayload = BaseNotificationPayload & {
  courseName: string;
  examType: string;
};

export type CourseMaterialAddedPayload = BaseNotificationPayload & {
  courseId: string;
  courseName: string;
  materialTitle: string;
};

export type GatePassUpdatedPayload = BaseNotificationPayload & {
  status: 'APPROVED' | 'REJECTED';
};

export type LeaveApprovedPayload = BaseNotificationPayload & {
  leaveType?: string;
  startDate?: string;
  endDate?: string;
};

export type MeetingRequestedPayload = BaseNotificationPayload & {
  studentName: string;
  meetingAt: string;
};

export type MeetingRespondedPayload = BaseNotificationPayload & {
  status: 'APPROVED' | 'REJECTED';
  meetingAt: string;
  remarks?: string;
};

export type JobPostedPayload = BaseNotificationPayload & {
  companyName: string;
  roleTitle: string;
};

export type PlacementStageUpdatedPayload = BaseNotificationPayload & {
  companyName: string;
  roleTitle: string;
  stage: string;
};

export type TicketReplyPayload = BaseNotificationPayload & {
  ticketId: string;
  subject: string;
};

export type LibraryOverduePayload = BaseNotificationPayload & {
  bookTitle: string;
  dueDate: string;
};

export type LibraryReservationReadyPayload = BaseNotificationPayload & {
  bookTitle: string;
};

export type TransportBusApproachingPayload = BaseNotificationPayload & {
  stopName: string;
  etaMinutes: number;
};

export type WorkflowApprovalRequiredPayload = BaseNotificationPayload & {
  category?: string;
  requestType?: string;
  requesterName?: string;
  routeReason?: string;
};

export type EventProposedPayload = BaseNotificationPayload & {
  eventId: string;
  clubId: string;
  eventTitle: string;
  clubName: string;
};

export type EventTierPayload = BaseNotificationPayload & {
  eventId: string;
  eventTitle: string;
  clubName?: string;
};

export type OnboardingCredentialsPayload = BaseNotificationPayload & {
  email: string;
  tempPassword: string;
};

export type HrExportReadyPayload = BaseNotificationPayload & {
  jobId: string;
  label: string;
  zipUrl: string;
};

export type HrExportFailedPayload = BaseNotificationPayload & {
  jobId: string;
  label: string;
  errorMessage: string;
};

export type AlumniConversionRequestedPayload = {
  tenantId: string;
  studentUserId: string;
  studentName: string;
  programName?: string | null;
  enrollmentNo?: string | null;
};

export type AlumniWelcomeEmailPayload = {
  tenantId: string;
  studentUserId: string;
  personalEmail: string;
  studentName: string;
};

export type AlumniConversionApprovedPayload = {
  tenantId: string;
  studentUserId: string;
  studentName: string;
  officialEmail: string;
};
