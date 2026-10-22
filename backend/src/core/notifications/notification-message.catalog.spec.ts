import {
  admitCardLockedMessage,
  feeGeneratedMessage,
  workflowApprovalRequiredMessage,
  onboardingCredentialsMessage,
} from './notification-message.catalog';

describe('notification-message.catalog', () => {
  it('describes an academic admit-card hold without inventing fee dues', () => {
    const message = admitCardLockedMessage({
      tenantId: 't1',
      userId: 'u1',
      reason: 'EXAM_ELIGIBILITY',
      message: 'Blocked: Open UFM case',
    });
    expect(message.title).toBe('Admit card blocked');
    expect(message.message).toBe('Blocked: Open UFM case');
    expect(message.category).toBe('EXAMS');
    expect(message.actionLink).toBe('/student/exams');
    expect(message.actionLabel).toBe('View exam eligibility');
  });

  it('preserves the fee hold message when no academic reason is supplied', () => {
    const message = admitCardLockedMessage({ tenantId: 't1', userId: 'u1' });
    expect(message.title).toContain('outstanding fees');
    expect(message.actionLink).toBe('/student/finance');
    expect(message.actionLabel).toBe('View fee dues');
  });
  it('builds descriptive fee messages with action context', () => {
    const msg = feeGeneratedMessage({
      tenantId: 't1',
      userId: 'u1',
      amount: 15000,
      dueDate: '2026-07-01',
      feeHead: 'Tuition',
    });

    expect(msg.title).toContain('fee');
    expect(msg.message).toContain('₹15000');
    expect(msg.message).toContain('2026-07-01');
    expect(msg.intent).toBe('action_required');
    expect(msg.actionLabel).toBe('Pay dues');
  });

  it('builds specific workflow approval titles', () => {
    const msg = workflowApprovalRequiredMessage({
      tenantId: 't1',
      userId: 'u1',
      requesterName: 'Priya Sharma',
      requestType: 'Leave request',
      actionLink: '/hr/inbox',
    });

    expect(msg.title).toContain('Priya Sharma');
    expect(msg.message).toContain('Priya Sharma');
    expect(msg.intent).toBe('action_required');
  });

  it('does not expose temporary passwords in onboarding notifications', () => {
    const msg = onboardingCredentialsMessage({
      tenantId: 't1',
      userId: 'u1',
      email: 'user@college.edu',
      tempPassword: 'secret123',
    });

    expect(msg.message).not.toContain('secret123');
    expect(msg.message).toContain('user@college.edu');
  });
});
