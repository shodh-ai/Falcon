import {
  nextAttendanceStatus,
  nextFundingStatus,
  nextGrievanceStatus,
  nextLeaveStatus,
  nextMeetingStatus,
  nextResearchStatus,
  nextResultApprovalStatus,
} from '../../helpers/workflow-states';

describe('Cross-module workflow state machines', () => {
  describe('Attendance approval flow (Faculty → HOD)', () => {
    it('submits for HOD approval then approves', () => {
      expect(nextAttendanceStatus('PENDING_HOD_APPROVAL', 'hod', 'approve')).toBe('APPROVED');
    });

    it('rejects invalid HOD action on submitted only', () => {
      expect(() => nextAttendanceStatus('SUBMITTED', 'hod', 'approve')).toThrow();
    });
  });

  describe('Leave approval flow (Faculty → HOD → HR)', () => {
    it('progresses through HOD and HR', () => {
      expect(nextLeaveStatus('PENDING', 'hod', 'approve')).toBe('HOD_APPROVED');
      expect(nextLeaveStatus('HOD_APPROVED', 'hr', 'approve')).toBe('HR_APPROVED');
    });
  });

  describe('Funding request flow (Faculty → HOD → Dean)', () => {
    it('escalates through approval chain', () => {
      expect(nextFundingStatus('DRAFT', 'faculty', 'submit')).toBe('PENDING_HOD');
      expect(nextFundingStatus('PENDING_HOD', 'hod', 'approve')).toBe('PENDING_DEAN');
      expect(nextFundingStatus('PENDING_DEAN', 'dean', 'approve')).toBe('APPROVED');
    });
  });

  describe('Research approval flow', () => {
    it('escalates to dean', () => {
      expect(nextResearchStatus('PENDING_HOD', 'hod', 'approve')).toBe('PENDING_DEAN');
      expect(nextResearchStatus('PENDING_DEAN', 'dean', 'approve')).toBe('APPROVED');
    });
  });

  describe('Result approval flow (Exam Cell → Dean)', () => {
    it('requires dean approval after exam cell request', () => {
      expect(nextResultApprovalStatus('PENDING', 'dean', 'approve')).toBe('APPROVED');
    });
  });

  describe('Meeting approval flow', () => {
    it('faculty request escalates to dean via HOD', () => {
      expect(nextMeetingStatus('REQUESTED', 'faculty', 'request')).toBe('PENDING_HOD');
      expect(nextMeetingStatus('PENDING_HOD', 'hod', 'approve')).toBe('PENDING_DEAN');
      expect(nextMeetingStatus('PENDING_DEAN', 'dean', 'approve')).toBe('APPROVED');
    });
  });

  describe('Student grievance flow', () => {
    it('escalates from HOD to dean', () => {
      expect(nextGrievanceStatus('OPEN', 'student', 'submit')).toBe('HOD_REVIEW');
      expect(nextGrievanceStatus('HOD_REVIEW', 'hod', 'escalate')).toBe('DEAN_REVIEW');
      expect(nextGrievanceStatus('DEAN_REVIEW', 'dean', 'resolve')).toBe('RESOLVED');
    });
  });
});
