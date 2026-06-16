import {
  feeGeneratedMessage,
  workflowApprovalRequiredMessage,
  onboardingCredentialsMessage,
} from './notification-message.catalog';

describe('notification-message.catalog', () => {
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
