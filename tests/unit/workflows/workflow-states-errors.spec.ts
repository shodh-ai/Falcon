import {
  nextAttendanceStatus,
  nextFundingStatus,
  nextGrievanceStatus,
  nextLeaveStatus,
  nextMeetingStatus,
  nextResearchStatus,
  nextResultApprovalStatus,
} from '../../helpers/workflow-states';

describe('Workflow state error branches', () => {
  it('leave: rejects invalid HOD transition', () => {
    expect(() => nextLeaveStatus('HOD_APPROVED', 'hod', 'approve')).toThrow();
  });

  it('attendance: rejects approve on SUBMITTED', () => {
    expect(() => nextAttendanceStatus('SUBMITTED', 'hod', 'approve')).toThrow();
  });

  it('funding: rejects dean approve on DRAFT', () => {
    expect(() => nextFundingStatus('DRAFT', 'dean', 'approve')).toThrow();
  });

  it('research: rejects faculty submit on PENDING_HOD', () => {
    expect(() => nextResearchStatus('PENDING_HOD', 'faculty', 'submit')).toThrow();
  });

  it('result: rejects dean approve without pending request', () => {
    expect(() =>
      nextResultApprovalStatus('APPROVED', 'dean', 'approve'),
    ).toThrow();
  });

  it('meeting: rejects hod approve on REQUESTED', () => {
    expect(() => nextMeetingStatus('REQUESTED', 'hod', 'approve')).toThrow();
  });

  it('grievance: rejects escalate from CLOSED', () => {
    expect(() => nextGrievanceStatus('CLOSED', 'hod', 'escalate')).toThrow();
  });
});
