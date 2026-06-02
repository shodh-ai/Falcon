export const NotificationEvents = {
  FINANCE_FEE_GENERATED: 'finance.fee_generated',
  FINANCE_ADMIT_CARD_LOCKED: 'finance.admit_card_locked',
  ACADEMICS_ATTENDANCE_WARNING: 'academics.attendance_warning',
  ACADEMICS_TIMETABLE_CHANGED: 'academics.timetable_changed',
  ACADEMICS_MARKS_PUBLISHED: 'academics.marks_published',
  OPERATIONS_GATE_PASS_UPDATED: 'operations.gate_pass_updated',
  HR_LEAVE_APPROVED: 'hr.leave_approved',
  ACADEMICS_MEETING_REQUESTED: 'academics.meeting_requested',
  PLACEMENT_JOB_POSTED: 'placement.job_posted',
  HELPDESK_TICKET_REPLY: 'helpdesk.ticket_reply',
  OPERATIONS_LIBRARY_OVERDUE: 'operations.library_overdue',
  WORKFLOW_APPROVAL_REQUIRED: 'workflow.approval_required',
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

export type JobPostedPayload = BaseNotificationPayload & {
  companyName: string;
  roleTitle: string;
};

export type TicketReplyPayload = BaseNotificationPayload & {
  ticketId: string;
  subject: string;
};

export type LibraryOverduePayload = BaseNotificationPayload & {
  bookTitle: string;
  dueDate: string;
};

export type WorkflowApprovalRequiredPayload = BaseNotificationPayload & {
  category?: string;
  requestType?: string;
  requesterName?: string;
  routeReason?: string;
};
