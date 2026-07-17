/** Pure workflow state helpers — mirror production statuses without DB. */

export type LeaveStatus = 'PENDING' | 'HOD_APPROVED' | 'HR_APPROVED' | 'REJECTED';

export function nextLeaveStatus(
  current: LeaveStatus,
  actor: 'hod' | 'hr',
  decision: 'approve' | 'reject',
): LeaveStatus {
  if (decision === 'reject') return 'REJECTED';
  if (actor === 'hod' && current === 'PENDING') return 'HOD_APPROVED';
  if (actor === 'hr' && current === 'HOD_APPROVED') return 'HR_APPROVED';
  throw new Error(`Invalid leave transition: ${current} via ${actor}`);
}

export type AttendanceApprovalStatus = 'SUBMITTED' | 'PENDING_HOD_APPROVAL' | 'APPROVED' | 'REJECTED';

export function nextAttendanceStatus(
  current: AttendanceApprovalStatus,
  actor: 'hod',
  decision: 'approve' | 'reject',
): AttendanceApprovalStatus {
  if (decision === 'reject') return 'REJECTED';
  if (actor === 'hod' && current === 'PENDING_HOD_APPROVAL') return 'APPROVED';
  throw new Error(`Invalid attendance transition: ${current}`);
}

export type FundingStatus = 'DRAFT' | 'PENDING_HOD' | 'PENDING_DEAN' | 'APPROVED' | 'REJECTED';

export function nextFundingStatus(
  current: FundingStatus,
  actor: 'faculty' | 'hod' | 'dean',
  decision: 'submit' | 'approve' | 'reject',
): FundingStatus {
  if (decision === 'reject') return 'REJECTED';
  if (actor === 'faculty' && current === 'DRAFT' && decision === 'submit') return 'PENDING_HOD';
  if (actor === 'hod' && current === 'PENDING_HOD' && decision === 'approve') return 'PENDING_DEAN';
  if (actor === 'dean' && current === 'PENDING_DEAN' && decision === 'approve') return 'APPROVED';
  throw new Error(`Invalid funding transition: ${current} via ${actor}`);
}

export type ResearchApprovalStatus = 'SUBMITTED' | 'PENDING_HOD' | 'PENDING_DEAN' | 'APPROVED' | 'REJECTED';

export function nextResearchStatus(
  current: ResearchApprovalStatus,
  actor: 'faculty' | 'hod' | 'dean',
  decision: 'submit' | 'approve' | 'reject',
): ResearchApprovalStatus {
  if (decision === 'reject') return 'REJECTED';
  if (actor === 'faculty' && current === 'SUBMITTED' && decision === 'submit') return 'PENDING_HOD';
  if (actor === 'hod' && current === 'PENDING_HOD' && decision === 'approve') return 'PENDING_DEAN';
  if (actor === 'dean' && current === 'PENDING_DEAN' && decision === 'approve') return 'APPROVED';
  throw new Error(`Invalid research transition: ${current} via ${actor}`);
}

export type ResultApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export function nextResultApprovalStatus(
  current: ResultApprovalStatus,
  actor: 'examcell' | 'dean',
  decision: 'request' | 'approve' | 'reject',
): ResultApprovalStatus {
  if (decision === 'reject') return 'REJECTED';
  if (actor === 'examcell' && decision === 'request') return 'PENDING';
  if (actor === 'dean' && current === 'PENDING' && decision === 'approve') return 'APPROVED';
  throw new Error(`Invalid result approval transition: ${current} via ${actor}`);
}

export type MeetingStatus = 'REQUESTED' | 'PENDING_HOD' | 'PENDING_DEAN' | 'APPROVED' | 'REJECTED';

export function nextMeetingStatus(
  current: MeetingStatus,
  actor: 'faculty' | 'hod' | 'dean',
  decision: 'request' | 'approve' | 'reject',
): MeetingStatus {
  if (decision === 'reject') return 'REJECTED';
  if (actor === 'faculty' && decision === 'request') return 'PENDING_HOD';
  if (actor === 'hod' && current === 'PENDING_HOD' && decision === 'approve') return 'PENDING_DEAN';
  if (actor === 'dean' && current === 'PENDING_DEAN' && decision === 'approve') return 'APPROVED';
  throw new Error(`Invalid meeting transition: ${current} via ${actor}`);
}

export type GrievanceStatus = 'OPEN' | 'HOD_REVIEW' | 'DEAN_REVIEW' | 'RESOLVED' | 'CLOSED';

export function nextGrievanceStatus(
  current: GrievanceStatus,
  actor: 'student' | 'hod' | 'dean',
  action: 'submit' | 'escalate' | 'resolve' | 'close',
): GrievanceStatus {
  if (action === 'close') return 'CLOSED';
  if (action === 'resolve') return 'RESOLVED';
  if (actor === 'student' && action === 'submit') return 'HOD_REVIEW';
  if (actor === 'hod' && current === 'HOD_REVIEW' && action === 'escalate') return 'DEAN_REVIEW';
  throw new Error(`Invalid grievance transition: ${current} via ${actor}`);
}
