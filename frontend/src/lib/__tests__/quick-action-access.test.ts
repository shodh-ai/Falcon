import { describe, expect, it } from 'vitest';
import { canRaiseHelpdeskTicket, canUseWorkforceQuickActions } from '../quick-action-access';

describe('finance quick-action access', () => {
  it.each(['CFO', 'APManager', 'APClerk', 'ProcurementBuyer', 'ReceivingClerk', 'Stores'])(
    'allows %s to request HR and facilities help',
    (role) => {
      expect(canUseWorkforceQuickActions({ role })).toBe(true);
      expect(canRaiseHelpdeskTicket({ role })).toBe(true);
    },
  );

  it('does not expose staff quick actions to students', () => {
    expect(canUseWorkforceQuickActions({ role: 'Student' })).toBe(false);
  });
});
