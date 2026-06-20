import type {
  AdmitCardLockedPayload,
  AlumniConversionRequestedPayload,
  AttendanceWarningPayload,
  CourseMaterialAddedPayload,
  EventProposedPayload,
  EventTierPayload,
  EventRejectedPayload,
  EventLivePayload,
  EventFundsTransferredPayload,
  ExamRevaluationPayload,
  MeetingPortalPayload,
  FeeGeneratedPayload,
  GatePassUpdatedPayload,
  HrExportFailedPayload,
  HrExportReadyPayload,
  JobPostedPayload,
  LeaveApprovedPayload,
  LibraryOverduePayload,
  LibraryReservationReadyPayload,
  MarksPublishedPayload,
  MeetingRequestedPayload,
  MeetingRespondedPayload,
  OnboardingCredentialsPayload,
  PlacementStageUpdatedPayload,
  TicketReplyPayload,
  TimetableChangedPayload,
  TransportBusApproachingPayload,
  WorkflowApprovalRequiredPayload,
  VenueBookingPayload,
} from './notification.events';
import {
  applyNotificationOverrides,
  formatDateRange,
  humanizeRequestType,
  type NotificationMessage,
  type NotificationMessageOverrides,
} from './notification-message.types';

export function feeGeneratedMessage(
  payload: FeeGeneratedPayload,
  overrides?: NotificationMessageOverrides,
): NotificationMessage {
  const feeHead = payload.feeHead ? ` (${payload.feeHead})` : '';
  return applyNotificationOverrides(
    {
      category: 'FINANCE',
      title: 'New fee demand posted',
      message: `A fee of ₹${payload.amount}${feeHead} is due by ${payload.dueDate}. Pay on time to avoid admit-card or registration holds.`,
      actionLink: '/student/finance',
      actionLabel: 'Pay dues',
      severity: 'warning',
      intent: 'action_required',
      metadata: { amount: payload.amount, dueDate: payload.dueDate, feeHead: payload.feeHead },
    },
    overrides,
  );
}

export function admitCardLockedMessage(
  payload: AdmitCardLockedPayload,
  overrides?: NotificationMessageOverrides,
): NotificationMessage {
  return applyNotificationOverrides(
    {
      category: 'FINANCE',
      title: 'Admit card locked due to outstanding fees',
      message:
        'Your admit card is locked because fee dues are pending. Clear the balance to download your admit card and sit for exams.',
      actionLink: '/student/finance',
      actionLabel: 'View fee dues',
      severity: 'critical',
      intent: 'action_required',
    },
    overrides,
  );
}

export function attendanceWarningMessage(
  payload: AttendanceWarningPayload,
  overrides?: NotificationMessageOverrides,
): NotificationMessage {
  const pct = payload.attendancePercent;
  return applyNotificationOverrides(
    {
      category: 'ACADEMICS',
      title: 'Attendance below 75% minimum',
      message: `Your overall attendance is ${pct}%, below the 75% requirement. Attend upcoming classes to avoid exam restrictions.`,
      actionLink: '/student/attendance',
      actionLabel: 'View attendance',
      severity: pct < 65 ? 'critical' : 'warning',
      intent: 'action_required',
      metadata: { attendancePercent: pct },
    },
    overrides,
  );
}

export function timetableChangedMessage(
  payload: TimetableChangedPayload,
  overrides?: NotificationMessageOverrides,
): NotificationMessage {
  return applyNotificationOverrides(
    {
      category: 'ACADEMICS',
      title: `Schedule updated — ${payload.courseName}`,
      message: `${payload.changeSummary}. Review your timetable so you do not miss the revised session.`,
      actionLink: '/student/timetable',
      actionLabel: 'Open timetable',
      severity: 'info',
      intent: 'status_update',
      metadata: { courseName: payload.courseName },
    },
    overrides,
  );
}

export function courseMaterialAddedMessage(
  payload: CourseMaterialAddedPayload,
  overrides?: NotificationMessageOverrides,
): NotificationMessage {
  return applyNotificationOverrides(
    {
      category: 'ACADEMICS',
      title: `New material — ${payload.courseName}`,
      message: `"${payload.materialTitle}" was added to ${payload.courseName}. Open the course workspace to review it before the next class.`,
      actionLink: `/student/courses/${payload.courseId}`,
      actionLabel: 'View material',
      severity: 'info',
      intent: 'info',
      metadata: { courseId: payload.courseId, materialTitle: payload.materialTitle },
    },
    overrides,
  );
}

export function marksPublishedMessage(
  payload: MarksPublishedPayload,
  overrides?: NotificationMessageOverrides,
): NotificationMessage {
  return applyNotificationOverrides(
    {
      category: 'ACADEMICS',
      title: `${payload.examType} marks published`,
      message: `${payload.examType} marks for ${payload.courseName} are now available. Review your score and raise any concerns with your faculty.`,
      actionLink: '/student/grades',
      actionLabel: 'View marks',
      severity: 'info',
      intent: 'status_update',
      metadata: { courseName: payload.courseName, examType: payload.examType },
    },
    overrides,
  );
}

export function examResultsPublishedMessage(
  payload: MarksPublishedPayload,
  overrides?: NotificationMessageOverrides,
): NotificationMessage {
  return applyNotificationOverrides(
    {
      category: 'EXAMS',
      title: `Results declared — ${payload.courseName}`,
      message: `End-semester results for ${payload.courseName} have been published. Check your grade and download the mark sheet if needed.`,
      actionLink: '/student/marks',
      actionLabel: 'View results',
      severity: 'success',
      intent: 'status_update',
      metadata: { courseName: payload.courseName, examType: payload.examType },
    },
    overrides,
  );
}

export function examRevaluationAssignedMessage(
  payload: ExamRevaluationPayload,
  overrides?: NotificationMessageOverrides,
): NotificationMessage {
  return applyNotificationOverrides(
    {
      category: 'EXAMS',
      title: `Re-evaluation assigned — ${payload.subjectName}`,
      message: `Exam Cell assigned you to reassess ${payload.studentName ?? 'a student'} for ${payload.subjectName}. Submit your report when done.`,
      actionLink: '/faculty/re-evaluations',
      actionLabel: 'Open reassessment',
      severity: 'info',
      intent: 'action_required',
      metadata: { applicationId: payload.applicationId, subjectName: payload.subjectName },
    },
    overrides,
  );
}

export function examRevaluationReportReadyMessage(
  payload: ExamRevaluationPayload,
  overrides?: NotificationMessageOverrides,
): NotificationMessage {
  return applyNotificationOverrides(
    {
      category: 'EXAMS',
      title: `Re-evaluation report ready — ${payload.subjectName}`,
      message: `${payload.studentName ?? 'A student'}'s reassessment for ${payload.subjectName} is ready for review and publishing.`,
      actionLink: '/exam-cell/re-evaluations',
      actionLabel: 'Review report',
      severity: 'info',
      intent: 'action_required',
      metadata: { applicationId: payload.applicationId },
    },
    overrides,
  );
}

export function examRevaluationPublishedMessage(
  payload: ExamRevaluationPayload,
  overrides?: NotificationMessageOverrides,
): NotificationMessage {
  const revised =
    payload.revisedMarks != null && payload.originalMarks != null
      ? ` Marks updated from ${payload.originalMarks} to ${payload.revisedMarks}.`
      : payload.revisedMarks != null
        ? ` Revised marks: ${payload.revisedMarks}.`
        : '';
  return applyNotificationOverrides(
    {
      category: 'EXAMS',
      title: `Re-evaluation report — ${payload.subjectName}`,
      message: `Your re-evaluation for ${payload.subjectName} has been published.${revised}`,
      actionLink: '/student/exams?intent=revaluation',
      actionLabel: 'View report',
      severity: 'success',
      intent: 'status_update',
      metadata: {
        applicationId: payload.applicationId,
        originalMarks: payload.originalMarks,
        revisedMarks: payload.revisedMarks,
      },
    },
    overrides,
  );
}

export function examRevaluationFeePaidMessage(
  payload: ExamRevaluationPayload,
  overrides?: NotificationMessageOverrides,
): NotificationMessage {
  return applyNotificationOverrides(
    {
      category: 'EXAMS',
      title: `Paid re-evaluation — ${payload.subjectName}`,
      message: `${payload.studentName ?? 'A student'} paid the re-evaluation fee for ${payload.subjectName}. Assign a faculty member to begin reassessment.`,
      actionLink: '/exam-cell/re-evaluations',
      actionLabel: 'Open queue',
      severity: 'info',
      intent: 'action_required',
      metadata: { applicationId: payload.applicationId },
    },
    overrides,
  );
}

export function gatePassUpdatedMessage(
  payload: GatePassUpdatedPayload,
  overrides?: NotificationMessageOverrides,
): NotificationMessage {
  const approved = payload.status === 'APPROVED';
  return applyNotificationOverrides(
    {
      category: 'HOSTEL',
      title: approved ? 'Gate pass approved' : 'Gate pass rejected',
      message: approved
        ? 'Your gate pass is approved. Show the QR code at the hostel gate when leaving campus.'
        : 'Your gate pass request was rejected. Contact the warden office to understand the reason and reapply if needed.',
      actionLink: '/student/gate-pass',
      actionLabel: approved ? 'View gate pass' : 'Review request',
      severity: approved ? 'success' : 'warning',
      intent: 'status_update',
      metadata: { status: payload.status },
    },
    overrides,
  );
}

export function leaveApprovedMessage(
  payload: LeaveApprovedPayload,
  overrides?: NotificationMessageOverrides,
): NotificationMessage {
  const range = formatDateRange(payload.startDate, payload.endDate);
  const leaveLabel = payload.leaveType ?? 'leave';
  return applyNotificationOverrides(
    {
      category: 'HR',
      title: `${humanizeRequestType(leaveLabel)} approved`,
      message: range
        ? `Your ${leaveLabel.toLowerCase()} request for ${range} has been approved. Your attendance calendar has been updated.`
        : `Your ${leaveLabel.toLowerCase()} request has been approved. Your attendance calendar has been updated.`,
      actionLink: '/faculty/leaves',
      actionLabel: 'View leave record',
      severity: 'success',
      intent: 'status_update',
      metadata: { leaveType: payload.leaveType, startDate: payload.startDate, endDate: payload.endDate },
    },
    overrides,
  );
}

export function penaltyAppliedMessage(
  payload: LeaveApprovedPayload & { message?: string },
  overrides?: NotificationMessageOverrides,
): NotificationMessage {
  return applyNotificationOverrides(
    {
      category: 'HR',
      title: 'Attendance penalty recorded',
      message:
        'An attendance penalty was applied to your record. Review your calendar and contact HR if you believe this is incorrect.',
      actionLink: '/ess/calendar',
      actionLabel: 'Review calendar',
      severity: 'warning',
      intent: 'alert',
    },
    overrides,
  );
}

export function meetingRequestedMessage(
  payload: MeetingRequestedPayload,
  overrides?: NotificationMessageOverrides,
): NotificationMessage {
  return applyNotificationOverrides(
    {
      category: 'ACADEMICS',
      title: `Meeting request from ${payload.studentName}`,
      message: `${payload.studentName} requested a mentorship meeting on ${payload.meetingAt}. Review the request and accept or decline.`,
      actionLink: '/faculty/mentorship',
      actionLabel: 'Review request',
      severity: 'info',
      intent: 'action_required',
      metadata: { studentName: payload.studentName, meetingAt: payload.meetingAt },
    },
    overrides,
  );
}

export function meetingRespondedMessage(
  payload: MeetingRespondedPayload,
  overrides?: NotificationMessageOverrides,
): NotificationMessage {
  const approved = payload.status === 'APPROVED';
  const when = new Date(payload.meetingAt).toLocaleString();
  const remarkSuffix = payload.remarks
    ? approved
      ? ` Note: ${payload.remarks}`
      : ` Reason: ${payload.remarks}`
    : '';
  return applyNotificationOverrides(
    {
      category: 'ACADEMICS',
      title: approved ? 'Mentorship meeting approved' : 'Mentorship meeting declined',
      message: approved
        ? `Your mentor approved the meeting scheduled for ${when}.${remarkSuffix}`
        : `Your mentor declined the meeting scheduled for ${when}.${remarkSuffix}`,
      actionLink: '/student/mentorship',
      actionLabel: 'View mentorship',
      severity: approved ? 'success' : 'warning',
      intent: 'status_update',
      metadata: { status: payload.status, meetingAt: payload.meetingAt },
    },
    overrides,
  );
}

export function jobPostedMessage(
  payload: JobPostedPayload,
  overrides?: NotificationMessageOverrides,
): NotificationMessage {
  return applyNotificationOverrides(
    {
      category: 'PLACEMENT',
      title: `New drive — ${payload.companyName}`,
      message: `${payload.companyName} is hiring for ${payload.roleTitle}. Review eligibility and apply before the deadline.`,
      actionLink: '/student/placements',
      actionLabel: 'View drive',
      severity: 'info',
      intent: 'action_required',
      metadata: { companyName: payload.companyName, roleTitle: payload.roleTitle },
    },
    overrides,
  );
}

export function placementStageUpdatedMessage(
  payload: PlacementStageUpdatedPayload,
  overrides?: NotificationMessageOverrides,
): NotificationMessage {
  const stageLabel = humanizeRequestType(payload.stage);
  return applyNotificationOverrides(
    {
      category: 'PLACEMENT',
      title: `Application update — ${payload.companyName}`,
      message: `Your application for ${payload.roleTitle} at ${payload.companyName} moved to "${stageLabel}". Check next steps in the placement hub.`,
      actionLink: '/student/placements',
      actionLabel: 'View application',
      severity: 'info',
      intent: 'status_update',
      metadata: { companyName: payload.companyName, stage: payload.stage },
    },
    overrides,
  );
}

export function ticketReplyMessage(
  payload: TicketReplyPayload,
  overrides?: NotificationMessageOverrides,
): NotificationMessage {
  return applyNotificationOverrides(
    {
      category: 'HELPDESK',
      title: `Helpdesk update — ${payload.subject}`,
      message: `Support replied on your ticket "${payload.subject}". Open the ticket to read the response and continue the conversation.`,
      actionLink: `/student/helpdesk?ticket=${encodeURIComponent(payload.ticketId)}`,
      actionLabel: 'Open ticket',
      severity: 'info',
      intent: 'action_required',
      metadata: { ticketId: payload.ticketId, subject: payload.subject },
    },
    overrides,
  );
}

export function workflowApprovalRequiredMessage(
  payload: WorkflowApprovalRequiredPayload,
  overrides?: NotificationMessageOverrides,
): NotificationMessage {
  const requestLabel = humanizeRequestType(payload.requestType ?? payload.title);
  const requester = payload.requesterName ?? 'Someone';
  const routeHint = payload.routeReason ? ` (${payload.routeReason})` : '';
  return applyNotificationOverrides(
    {
      category: (payload.category as NotificationMessage['category']) ?? 'HR',
      title: payload.requesterName
        ? `${requestLabel} pending — ${payload.requesterName}`
        : `${requestLabel} needs your approval`,
      message: payload.requesterName
        ? `${requester} submitted a ${requestLabel.toLowerCase()} that requires your approval${routeHint}. Review the details and approve or reject promptly.`
        : `A ${requestLabel.toLowerCase()} is waiting for your approval${routeHint}. Open your inbox to review and take action.`,
      actionLink: payload.actionLink,
      actionLabel: 'Review request',
      severity: 'warning',
      intent: 'action_required',
      metadata: {
        requestType: payload.requestType ?? payload.title,
        requesterName: payload.requesterName,
        routeReason: payload.routeReason,
      },
    },
    overrides,
  );
}

export function libraryOverdueMessage(
  payload: LibraryOverduePayload,
  overrides?: NotificationMessageOverrides,
): NotificationMessage {
  return applyNotificationOverrides(
    {
      category: 'OPERATIONS',
      title: 'Library book overdue',
      message: `"${payload.bookTitle}" was due on ${payload.dueDate}. Return it to the circulation desk to avoid daily fines.`,
      actionLink: '/student/library',
      actionLabel: 'View loans',
      severity: 'warning',
      intent: 'action_required',
      metadata: { bookTitle: payload.bookTitle, dueDate: payload.dueDate },
    },
    overrides,
  );
}

export function libraryReservationReadyMessage(
  payload: LibraryReservationReadyPayload,
  overrides?: NotificationMessageOverrides,
): NotificationMessage {
  return applyNotificationOverrides(
    {
      category: 'OPERATIONS',
      title: 'Reserved book ready for pickup',
      message: `"${payload.bookTitle}" is ready at the circulation counter. Collect it within the hold window to avoid cancellation.`,
      actionLink: '/student/library',
      actionLabel: 'View reservation',
      severity: 'success',
      intent: 'action_required',
      metadata: { bookTitle: payload.bookTitle },
    },
    overrides,
  );
}

export function transportBusApproachingMessage(
  payload: TransportBusApproachingPayload,
  overrides?: NotificationMessageOverrides,
): NotificationMessage {
  return applyNotificationOverrides(
    {
      category: 'OPERATIONS',
      title: 'Campus bus approaching',
      message: `Your bus is about ${payload.etaMinutes} minute${payload.etaMinutes === 1 ? '' : 's'} from ${payload.stopName}. Head to the stop to board on time.`,
      actionLink: '/student/transport',
      actionLabel: 'Track bus',
      severity: 'info',
      intent: 'alert',
      metadata: { stopName: payload.stopName, etaMinutes: payload.etaMinutes },
    },
    overrides,
  );
}

export function eventProposedMessage(
  payload: EventProposedPayload,
  overrides?: NotificationMessageOverrides,
): NotificationMessage {
  return applyNotificationOverrides(
    {
      category: 'OPERATIONS',
      title: 'Club event awaiting faculty approval',
      message: `${payload.clubName} proposed "${payload.eventTitle}". Review the proposal and approve or send back for changes.`,
      actionLink: '/faculty/event-approvals',
      actionLabel: 'Review event',
      severity: 'info',
      intent: 'action_required',
      metadata: { eventId: payload.eventId, clubName: payload.clubName },
    },
    overrides,
  );
}

export function eventPendingEstateMessage(
  payload: EventTierPayload,
  overrides?: NotificationMessageOverrides,
): NotificationMessage {
  return applyNotificationOverrides(
    {
      category: 'OPERATIONS',
      title: 'Venue approval required',
      message: `"${payload.eventTitle}" passed faculty review. Confirm venue allocation and security arrangements before the event is published.`,
      actionLink: '/admin-ops/events',
      actionLabel: 'Confirm venue',
      severity: 'warning',
      intent: 'action_required',
      metadata: { eventId: payload.eventId, eventTitle: payload.eventTitle },
    },
    overrides,
  );
}

export function eventPendingFinanceMessage(
  payload: EventTierPayload,
  overrides?: NotificationMessageOverrides,
): NotificationMessage {
  return applyNotificationOverrides(
    {
      category: 'FINANCE',
      title: 'Club event fund transfer required',
      message: `"${payload.eventTitle}" needs university funds transferred before it can go live.`,
      actionLink: '/finance/events',
      actionLabel: 'Transfer funds',
      severity: 'warning',
      intent: 'action_required',
      metadata: { eventId: payload.eventId, eventTitle: payload.eventTitle },
    },
    overrides,
  );
}

export function eventPendingHodMessage(
  payload: EventTierPayload,
  overrides?: NotificationMessageOverrides,
): NotificationMessage {
  return applyNotificationOverrides(
    {
      category: 'OPERATIONS',
      title: 'Club event needs HOD approval',
      message: `"${payload.eventTitle}" passed faculty review and awaits your HOD sign-off.`,
      actionLink: '/hod/events',
      actionLabel: 'Review event',
      severity: 'warning',
      intent: 'action_required',
      metadata: { eventId: payload.eventId, eventTitle: payload.eventTitle },
    },
    overrides,
  );
}

export function eventPendingDeanMessage(
  payload: EventTierPayload,
  overrides?: NotificationMessageOverrides,
): NotificationMessage {
  return applyNotificationOverrides(
    {
      category: 'OPERATIONS',
      title: 'Club event needs Dean approval',
      message: `"${payload.eventTitle}" passed HOD review and awaits Dean sign-off.`,
      actionLink: '/dean/events',
      actionLabel: 'Review event',
      severity: 'warning',
      intent: 'action_required',
      metadata: { eventId: payload.eventId, eventTitle: payload.eventTitle },
    },
    overrides,
  );
}

export function eventRejectedMessage(
  payload: EventRejectedPayload,
  overrides?: NotificationMessageOverrides,
): NotificationMessage {
  return applyNotificationOverrides(
    {
      category: 'OPERATIONS',
      title: `Event rejected by ${payload.rejectedByTier}`,
      message: payload.comment
        ? `"${payload.eventTitle}" was rejected: ${payload.comment}`
        : `"${payload.eventTitle}" was rejected at the ${payload.rejectedByTier} stage.`,
      actionLink: '/student/club-management',
      actionLabel: 'View club events',
      severity: 'critical',
      intent: 'status_update',
      metadata: { eventId: payload.eventId, rejectedByTier: payload.rejectedByTier },
    },
    overrides,
  );
}

export function eventLiveMessage(
  payload: EventLivePayload,
  overrides?: NotificationMessageOverrides,
): NotificationMessage {
  return applyNotificationOverrides(
    {
      category: 'OPERATIONS',
      title: 'Club event is live',
      message: `"${payload.eventTitle}" is now live. Students can register and you can manage attendance.`,
      actionLink: '/student/club-management',
      actionLabel: 'Manage event',
      severity: 'success',
      intent: 'status_update',
      metadata: { eventId: payload.eventId, eventTitle: payload.eventTitle },
    },
    overrides,
  );
}

export function eventFundsTransferredMessage(
  payload: EventFundsTransferredPayload,
  overrides?: NotificationMessageOverrides,
): NotificationMessage {
  return applyNotificationOverrides(
    {
      category: 'FINANCE',
      title: 'Event funds transferred',
      message: `₹${payload.amount.toLocaleString('en-IN')} was transferred for "${payload.eventTitle}"${payload.transferRef ? ` (ref: ${payload.transferRef})` : ''}.`,
      actionLink: '/student/club-management',
      actionLabel: 'View event',
      severity: 'success',
      intent: 'status_update',
      metadata: { eventId: payload.eventId, amount: payload.amount },
    },
    overrides,
  );
}

export function meetingInvitedMessage(
  payload: MeetingPortalPayload,
  overrides?: NotificationMessageOverrides,
): NotificationMessage {
  const when = payload.startsAt ? new Date(payload.startsAt).toLocaleString() : 'the scheduled time';
  return applyNotificationOverrides(
    {
      category: 'HR',
      title: `Meeting invitation — ${payload.title}`,
      message: `${payload.organizerName ?? 'A colleague'} invited you to "${payload.title}" on ${when}.`,
      actionLink: payload.actionLink ?? '/faculty/meetings',
      actionLabel: 'View meeting',
      severity: 'info',
      intent: 'action_required',
      metadata: { meetingId: payload.meetingId, title: payload.title },
    },
    overrides,
  );
}

export function meetingRequestedUpwardMessage(
  payload: MeetingPortalPayload,
  overrides?: NotificationMessageOverrides,
): NotificationMessage {
  const when = payload.startsAt ? new Date(payload.startsAt).toLocaleString() : 'the requested time';
  return applyNotificationOverrides(
    {
      category: 'HR',
      title: `Meeting request — ${payload.title}`,
      message: `${payload.requesterName ?? 'A colleague'} requested a meeting on ${when}. Accept or decline from your meetings workspace.`,
      actionLink: payload.actionLink ?? '/faculty/meetings',
      actionLabel: 'Review request',
      severity: 'warning',
      intent: 'action_required',
      metadata: { meetingId: payload.meetingId, title: payload.title },
    },
    overrides,
  );
}

export function meetingPortalRespondedMessage(
  payload: MeetingPortalPayload,
  overrides?: NotificationMessageOverrides,
): NotificationMessage {
  const accepted = payload.status === 'ACCEPTED';
  const when = payload.startsAt ? new Date(payload.startsAt).toLocaleString() : 'the scheduled time';
  return applyNotificationOverrides(
    {
      category: 'HR',
      title: accepted ? 'Meeting accepted' : 'Meeting declined',
      message: accepted
        ? `${payload.responderName ?? 'The invitee'} accepted "${payload.title}" for ${when}.${payload.remarks ? ` Note: ${payload.remarks}` : ''}`
        : `${payload.responderName ?? 'The invitee'} declined "${payload.title}".${payload.remarks ? ` Reason: ${payload.remarks}` : ''}`,
      actionLink: payload.actionLink ?? '/faculty/meetings',
      actionLabel: 'View meeting',
      severity: accepted ? 'success' : 'warning',
      intent: 'status_update',
      metadata: { meetingId: payload.meetingId, status: payload.status },
    },
    overrides,
  );
}

export function meetingAgendaUpdatedMessage(
  payload: MeetingPortalPayload,
  overrides?: NotificationMessageOverrides,
): NotificationMessage {
  return applyNotificationOverrides(
    {
      category: 'HR',
      title: `Agenda updated — ${payload.title}`,
      message: `The agenda for "${payload.title}" was updated. Review the latest details before the meeting.`,
      actionLink: payload.actionLink ?? '/faculty/meetings',
      actionLabel: 'View agenda',
      severity: 'info',
      intent: 'info',
      metadata: { meetingId: payload.meetingId },
    },
    overrides,
  );
}

export function meetingMinutesPublishedMessage(
  payload: MeetingPortalPayload,
  overrides?: NotificationMessageOverrides,
): NotificationMessage {
  return applyNotificationOverrides(
    {
      category: 'HR',
      title: `Minutes published — ${payload.title}`,
      message: `Meeting minutes for "${payload.title}" are now available.`,
      actionLink: payload.actionLink ?? '/faculty/meetings',
      actionLabel: 'Read minutes',
      severity: 'success',
      intent: 'status_update',
      metadata: { meetingId: payload.meetingId },
    },
    overrides,
  );
}

export function onboardingCredentialsMessage(
  payload: OnboardingCredentialsPayload,
  overrides?: NotificationMessageOverrides,
): NotificationMessage {
  return applyNotificationOverrides(
    {
      category: 'HR',
      title: 'Welcome — complete your onboarding',
      message: `Your Falcon account (${payload.email}) is ready. Check your official email for login credentials, then sign in and complete onboarding.`,
      actionLink: '/login',
      actionLabel: 'Sign in',
      severity: 'info',
      intent: 'action_required',
      metadata: { email: payload.email },
    },
    overrides,
  );
}

export function exportReadyMessage(
  payload: HrExportReadyPayload,
  overrides?: NotificationMessageOverrides,
): NotificationMessage {
  return applyNotificationOverrides(
    {
      category: 'HR',
      title: `${payload.label} export ready`,
      message: `Your ${payload.label} document archive finished processing and is ready to download.`,
      actionLink: payload.actionLink ?? `/hr/export-job/${payload.jobId}`,
      actionLabel: 'Download archive',
      severity: 'success',
      intent: 'action_required',
      metadata: { jobId: payload.jobId, label: payload.label },
    },
    overrides,
  );
}

export function exportFailedMessage(
  payload: HrExportFailedPayload,
  overrides?: NotificationMessageOverrides,
): NotificationMessage {
  return applyNotificationOverrides(
    {
      category: 'HR',
      title: `${payload.label} export failed`,
      message: `We could not build your ${payload.label} archive: ${payload.errorMessage}. Try again or contact IT support if this persists.`,
      actionLink: '/hr/directory',
      actionLabel: 'Retry export',
      severity: 'critical',
      intent: 'action_required',
      metadata: { jobId: payload.jobId, label: payload.label, errorMessage: payload.errorMessage },
    },
    overrides,
  );
}

export function alumniConversionRequestedMessage(
  payload: AlumniConversionRequestedPayload,
): NotificationMessage {
  const programSuffix = payload.programName ? ` (${payload.programName})` : '';
  const enrollmentSuffix = payload.enrollmentNo ? ` · ${payload.enrollmentNo}` : '';
  return {
    category: 'OPERATIONS',
    title: `Alumni conversion — ${payload.studentName}`,
    message: `${payload.studentName}${programSuffix}${enrollmentSuffix} requested alumni conversion. Verify documents and approve or reject the request.`,
    actionLink: '/alumni-admin/verification',
    actionLabel: 'Review conversion',
    severity: 'info',
    intent: 'action_required',
    metadata: {
      studentUserId: payload.studentUserId,
      studentName: payload.studentName,
      programName: payload.programName,
    },
  };
}

export function hostelBroadcastMessage(input: {
  title: string;
  message: string;
}): NotificationMessage {
  return {
    category: 'HOSTEL',
    title: input.title,
    message: input.message,
    actionLink: '/student/hostel',
    actionLabel: 'View hostel notice',
    severity: 'info',
    intent: 'info',
  };
}

export function medicalLeaveAlertMessage(input: {
  patientName: string;
  restDays: number;
  diagnosis: string;
}): NotificationMessage {
  return {
    category: 'HOSTEL',
    title: `Medical leave — ${input.patientName}`,
    message: `${input.patientName} was advised ${input.restDays} day(s) rest (${input.diagnosis}). Attendance has been marked as medical leave — monitor hostel records.`,
    actionLink: '/hostel-admin/students',
    actionLabel: 'View student',
    severity: 'warning',
    intent: 'alert',
    metadata: { patientName: input.patientName, restDays: input.restDays },
  };
}

export function executiveAuditRequestMessage(input: {
  label: string;
  customMessage?: string;
}): NotificationMessage {
  return {
    category: 'ACADEMICS',
    title: 'Executive audit request',
    message:
      input.customMessage ??
      `The Chairman requested an audit on ${input.label} attendance. Review the flagged records and submit your response.`,
    actionLink: '/hod/students/attendance',
    actionLabel: 'Review attendance',
    severity: 'warning',
    intent: 'action_required',
    metadata: { label: input.label },
  };
}

export function financialAnomalyMessage(input: {
  message: string;
  severity: 'RED' | 'AMBER';
  ruleCode?: string;
}): NotificationMessage {
  const critical = input.severity === 'RED';
  return {
    category: 'FINANCE',
    title: critical ? 'Critical financial alert' : 'Financial attention required',
    message: input.message,
    actionLink: '/leadership/intelligence',
    actionLabel: 'Open intelligence',
    severity: critical ? 'critical' : 'warning',
    intent: 'alert',
    metadata: { ruleCode: input.ruleCode, severity: input.severity },
  };
}

export function budgetAlertMessage(input: {
  title: string;
  message: string;
}): NotificationMessage {
  return {
    category: 'FINANCE',
    title: input.title,
    message: input.message,
    actionLink: '/leadership/budget',
    actionLabel: 'Review budget',
    severity: 'warning',
    intent: 'alert',
  };
}

export function leadershipHelpdeskEscalationMessage(input: {
  title: string;
  message: string;
  actionLink: string;
}): NotificationMessage {
  return {
    category: 'HELPDESK',
    title: input.title,
    message: input.message,
    actionLink: input.actionLink,
    actionLabel: 'Review ticket',
    severity: 'warning',
    intent: 'action_required',
  };
}

export function ecellStatusUpdatedMessage(
  payload: { title?: string; message?: string; actionLink?: string },
  overrides?: NotificationMessageOverrides,
): NotificationMessage {
  return applyNotificationOverrides(
    {
      category: 'OPERATIONS',
      title: payload.title ?? 'E-Cell Incubation Update',
      message: payload.message ?? 'Your incubation pitch status has been updated.',
      actionLink: payload.actionLink ?? '/student/e-cell',
      actionLabel: 'View tracker',
      severity: 'info',
      intent: 'status_update',
    },
    overrides,
  );
}

export function ecellMentorMeetingRequestedMessage(
  payload: { startupName: string; topic: string; requestedTime: string; actionLink?: string },
  overrides?: NotificationMessageOverrides,
): NotificationMessage {
  const when = new Date(payload.requestedTime).toLocaleString();
  return applyNotificationOverrides(
    {
      category: 'ACADEMICS',
      title: `Mentoring request — ${payload.startupName}`,
      message: `Startup ${payload.startupName} requested a mentoring session on ${when}. Topic: ${payload.topic}`,
      actionLink: payload.actionLink ?? '/faculty/mentorship',
      actionLabel: 'Open inbox',
      severity: 'warning',
      intent: 'action_required',
    },
    overrides,
  );
}

export function ecellMentorMeetingRespondedMessage(
  payload: {
    mentorName: string;
    accepted: boolean;
    requestedTime: string;
    meetingLink?: string;
    declineReason?: string;
    actionLink?: string;
  },
  overrides?: NotificationMessageOverrides,
): NotificationMessage {
  const when = new Date(payload.requestedTime).toLocaleString();
  const message = payload.accepted
    ? `Your meeting with ${payload.mentorName} is confirmed for ${when}!${payload.meetingLink ? ` Link/Room: ${payload.meetingLink}` : ''}`
    : `${payload.mentorName} declined your session (${when}). ${payload.declineReason ?? ''}`.trim();
  return applyNotificationOverrides(
    {
      category: 'ACADEMICS',
      title: payload.accepted ? 'Mentor meeting confirmed' : 'Mentor meeting declined',
      message,
      actionLink: payload.actionLink ?? '/student/e-cell',
      actionLabel: 'View Founder Hub',
      severity: payload.accepted ? 'success' : 'warning',
      intent: 'status_update',
    },
    overrides,
  );
}

export function ecellMentorFeedbackRequestedMessage(
  payload: { startupName: string; topic: string; actionLink?: string },
  overrides?: NotificationMessageOverrides,
): NotificationMessage {
  return applyNotificationOverrides(
    {
      category: 'ACADEMICS',
      title: 'Share mentoring feedback',
      message: `How was your session with startup ${payload.startupName}? Topic: ${payload.topic}. Please leave brief feedback for the Incubation Cell.`,
      actionLink: payload.actionLink ?? '/faculty/mentorship',
      actionLabel: 'Leave feedback',
      severity: 'info',
      intent: 'action_required',
    },
    overrides,
  );
}

export function venueBookingPendingApprovalMessage(
  payload: VenueBookingPayload,
  overrides?: NotificationMessageOverrides,
): NotificationMessage {
  return applyNotificationOverrides(
    {
      category: 'OPERATIONS',
      title: 'Venue booking awaiting approval',
      message:
        payload.message ??
        `${payload.studentName ?? 'A student'} requested ${payload.venueName} for "${payload.purpose ?? 'academic use'}". Review and approve or reject.`,
      actionLink: payload.actionLink ?? '/library/venue-requests',
      actionLabel: 'Review request',
      severity: 'warning',
      intent: 'action_required',
      metadata: { bookingId: payload.bookingId, venueName: payload.venueName },
    },
    overrides,
  );
}

export function venueBookingApprovedMessage(
  payload: VenueBookingPayload,
  overrides?: NotificationMessageOverrides,
): NotificationMessage {
  return applyNotificationOverrides(
    {
      category: 'OPERATIONS',
      title: 'Venue booking confirmed',
      message:
        payload.message ??
        `Your booking for ${payload.venueName} is approved. Open your digital room pass before heading to the venue.`,
      actionLink: payload.actionLink ?? '/student/venues',
      actionLabel: 'View room pass',
      severity: 'success',
      intent: 'status_update',
      metadata: { bookingId: payload.bookingId, venueName: payload.venueName },
    },
    overrides,
  );
}

export function venueBookingRejectedMessage(
  payload: VenueBookingPayload,
  overrides?: NotificationMessageOverrides,
): NotificationMessage {
  return applyNotificationOverrides(
    {
      category: 'OPERATIONS',
      title: 'Venue booking not approved',
      message:
        payload.message ??
        `Your request for ${payload.venueName} was not approved.${payload.remarks ? ` Reason: ${payload.remarks}` : ''}`,
      actionLink: payload.actionLink ?? '/student/venues',
      actionLabel: 'Book another slot',
      severity: 'warning',
      intent: 'status_update',
      metadata: { bookingId: payload.bookingId, venueName: payload.venueName },
    },
    overrides,
  );
}
