import {
  nextAttendanceStatus,
  nextFundingStatus,
  nextLeaveStatus,
  nextMeetingStatus,
  nextResearchStatus,
  nextResultApprovalStatus,
} from '../../helpers/workflow-states';

describe('Workflow state reject branches', () => {
  it('leave reject from PENDING', () => {
    expect(nextLeaveStatus('PENDING', 'hod', 'reject')).toBe('REJECTED');
  });

  it('attendance reject from PENDING_HOD_APPROVAL', () => {
    expect(nextAttendanceStatus('PENDING_HOD_APPROVAL', 'hod', 'reject')).toBe('REJECTED');
  });

  it('funding reject from PENDING_DEAN', () => {
    expect(nextFundingStatus('PENDING_DEAN', 'dean', 'reject')).toBe('REJECTED');
  });

  it('research reject from PENDING_DEAN', () => {
    expect(nextResearchStatus('PENDING_DEAN', 'dean', 'reject')).toBe('REJECTED');
  });

  it('result reject from PENDING', () => {
    expect(nextResultApprovalStatus('PENDING', 'dean', 'reject')).toBe('REJECTED');
  });

  it('meeting reject from PENDING_DEAN', () => {
    expect(nextMeetingStatus('PENDING_DEAN', 'dean', 'reject')).toBe('REJECTED');
  });
});
