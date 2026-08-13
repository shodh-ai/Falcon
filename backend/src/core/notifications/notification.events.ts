export const NotificationEvents = {
  FINANCE_FEE_GENERATED: 'finance.fee_generated',
  FINANCE_ADMIT_CARD_LOCKED: 'finance.admit_card_locked',
  EXAM_RESULTS_PUBLISHED: 'exam.results_published',
  EXAM_REVALUATION_ASSIGNED: 'exam.revaluation_assigned',
  EXAM_REVALUATION_REPORT_READY: 'exam.revaluation_report_ready',
  EXAM_REVALUATION_PUBLISHED: 'exam.revaluation_published',
  EXAM_REVALUATION_FEE_PAID: 'exam.revaluation_fee_paid',
  ACADEMICS_ATTENDANCE_WARNING: 'academics.attendance_warning',
  ACADEMICS_TIMETABLE_CHANGED: 'academics.timetable_changed',
  ACADEMICS_MARKS_PUBLISHED: 'academics.marks_published',
  ACADEMICS_COURSE_MATERIAL_ADDED: 'academics.course_material_added',
  ACADEMICS_ASSIGNMENT_PUBLISHED: 'academics.assignment_published',
  ACADEMICS_WEEKLY_TEST_PUBLISHED: 'academics.weekly_test_published',
  ACADEMICS_LIVE_CLASS_SCHEDULED: 'academics.live_class_scheduled',
  ACADEMICS_COURSE_ANNOUNCEMENT: 'academics.course_announcement',
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
  EVENT_PENDING_HOD: 'event.pending_hod',
  EVENT_PENDING_DEAN: 'event.pending_dean',
  EVENT_PENDING_ESTATE: 'event.pending_estate',
  EVENT_PENDING_FINANCE: 'event.pending_finance',
  EVENT_REJECTED: 'event.rejected',
  EVENT_LIVE: 'event.live',
  EVENT_FUNDS_TRANSFERRED: 'event.funds_transferred',
  MEETING_INVITED: 'meetings.invited',
  MEETING_REQUESTED_UPWARD: 'meetings.requested_upward',
  MEETING_RESPONDED: 'meetings.responded',
  MEETING_AGENDA_UPDATED: 'meetings.agenda_updated',
  MEETING_MINUTES_PUBLISHED: 'meetings.minutes_published',
  HR_ONBOARDING_CREDENTIALS: 'hr.onboarding_credentials',
  HR_EXPORT_READY: 'hr.export_ready',
  HR_EXPORT_FAILED: 'hr.export_failed',
  ALUMNI_CONVERSION_REQUESTED: 'alumni.conversion_requested',
  ALUMNI_CONVERSION_APPROVED: 'alumni.conversion_approved',
  ALUMNI_WELCOME_EMAIL: 'alumni.welcome_email',
  STUDENT_ONBOARDING_APPROVED: 'student.onboarding_approved',
  STUDENT_ONBOARDING_REJECTED: 'student.onboarding_rejected',
  TRANSCRIPT_GENERATED: 'transcript.generated',
  ONBOARDING_VERIFICATION_REQUESTED: 'onboarding.verification_requested',
  ECELL_STATUS_UPDATED: 'ecell.status_updated',
  ECELL_MENTOR_MEETING_REQUESTED: 'ecell.mentor_meeting_requested',
  ECELL_MENTOR_MEETING_RESPONDED: 'ecell.mentor_meeting_responded',
  ECELL_MENTOR_FEEDBACK_REQUESTED: 'ecell.mentor_feedback_requested',
  VENUE_BOOKING_PENDING_APPROVAL: 'venue.booking_pending_approval',
  VENUE_BOOKING_APPROVED: 'venue.booking_approved',
  VENUE_BOOKING_REJECTED: 'venue.booking_rejected',
  ACADEMIC_RND_STATUS_UPDATED: 'academic_rnd.status_updated',
  CERTIFICATE_STATUS_UPDATED: 'certificate.status_updated',
  EXAM_DUTY_SWAP_PEER_REQUEST: 'exam.duty_swap_peer_request',
  EXAM_DUTY_SWAP_PEER_REJECTED: 'exam.duty_swap_peer_rejected',
  EXAM_DUTY_SWAP_EXAM_CELL_PENDING: 'exam.duty_swap_exam_cell_pending',
  EXAM_DUTY_SWAP_RESOLVED: 'exam.duty_swap_resolved',
  GRADE_CHANGE_HOD_PENDING: 'sis.grade_change_hod_pending',
  GRADE_CHANGE_COE_PENDING: 'sis.grade_change_coe_pending',
  GRADE_CHANGE_RESOLVED: 'sis.grade_change_resolved',
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

export type ExamRevaluationPayload = BaseNotificationPayload & {
  applicationId: string;
  subjectName: string;
  subjectCode?: string;
  studentName?: string;
  originalMarks?: number | null;
  revisedMarks?: number | null;
  reportNotes?: string | null;
};

export type CourseMaterialAddedPayload = BaseNotificationPayload & {
  courseId: string;
  courseName: string;
  materialTitle: string;
};

export type AssignmentPublishedPayload = BaseNotificationPayload & {
  assignmentId: string;
  courseId: string;
  courseName: string;
  courseCode?: string;
  assignmentTitle: string;
  facultyName: string;
  dueDate: string;
  maxMarks: number;
  semester?: number | null;
  sectionCode?: string | null;
};

export type LiveClassScheduledPayload = BaseNotificationPayload & {
  courseId: string;
  courseName: string;
  courseCode?: string;
  liveClassTitle: string;
  startsAt: string;
};

export type WeeklyTestPublishedPayload = BaseNotificationPayload & {
  testId: string;
  courseId: string;
  courseName: string;
  courseCode?: string;
  testType: string;
  startTime: string;
  endTime: string;
};

export type CourseAnnouncementPayload = BaseNotificationPayload & {
  courseId: string;
  courseName: string;
  courseCode?: string;
  announcementId: string;
  title: string;
  bodyPreview: string;
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

export type EventRejectedPayload = BaseNotificationPayload & {
  eventId: string;
  eventTitle: string;
  clubName?: string;
  rejectedByTier: string;
  comment?: string;
};

export type EventLivePayload = BaseNotificationPayload & {
  eventId: string;
  eventTitle: string;
  clubName?: string;
};

export type EventFundsTransferredPayload = BaseNotificationPayload & {
  eventId: string;
  eventTitle: string;
  amount: number;
  transferRef?: string;
};

export type MeetingPortalPayload = BaseNotificationPayload & {
  meetingId: string;
  title: string;
  organizerName?: string;
  requesterName?: string;
  responderName?: string;
  startsAt?: string;
  status?: 'ACCEPTED' | 'DECLINED';
  remarks?: string;
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

export type StudentOnboardingApprovedPayload = {
  tenantId: string;
  userId: string;
  studentName: string;
  officialEmail: string;
  dashboardPath?: string;
};

export type StudentOnboardingRejectedPayload = {
  tenantId: string;
  userId: string;
  studentName: string;
  officialEmail: string;
  remarks: string;
  dashboardPath?: string;
};

export type TranscriptGeneratedPayload = BaseNotificationPayload & {
  semester: number;
  verificationCode?: string;
};

export type OnboardingVerificationRequestedPayload = {
  tenantId: string;
  targetUserId: string;
  submitterName: string;
  submitterEmail: string;
  roleName: string;
  portalKind: 'student' | 'staff';
};

export type EcellStatusUpdatedPayload = BaseNotificationPayload;

export type EcellMentorMeetingRequestedPayload = BaseNotificationPayload & {
  startupName: string;
  topic: string;
  requestedTime: string;
};

export type EcellMentorMeetingRespondedPayload = BaseNotificationPayload & {
  mentorName: string;
  accepted: boolean;
  requestedTime: string;
  meetingLink?: string;
  declineReason?: string;
};

export type EcellMentorFeedbackRequestedPayload = BaseNotificationPayload & {
  startupName: string;
  topic: string;
};

export type VenueBookingPayload = BaseNotificationPayload & {
  bookingId: string;
  venueName: string;
  studentName?: string;
  purpose?: string;
  startTime?: string;
  endTime?: string;
  remarks?: string;
};

export type AcademicRndStatusUpdatedPayload = BaseNotificationPayload;

export type CertificateStatusUpdatedPayload = BaseNotificationPayload;

export type ExamDutySwapPayload = BaseNotificationPayload & {
  swapId: string;
  assignmentId: string;
  requesterName: string;
  targetName?: string;
  examDate: string;
  room: string;
  sessionLabel?: string | null;
  decision?: 'APPROVED' | 'REJECTED';
  comment?: string | null;
};

export type GradeChangePayload = BaseNotificationPayload & {
  changeId: string;
  courseCode: string;
  fromGrade: string;
  toGrade: string;
  requesterName: string;
  studentName?: string | null;
  decision?: 'APPLIED' | 'REJECTED';
};
