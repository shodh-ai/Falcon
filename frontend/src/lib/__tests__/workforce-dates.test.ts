import { afterEach, describe, expect, it, vi } from 'vitest';
import { WORKFORCE_RETROACTIVE_DAYS, workforceDateInputProps, workforceMinDate } from '../workforce-dates';

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe('workforce request date limits', () => {
  it.each([
    ['Asia/Kolkata', '2026-10-22T19:00:00Z', '2026-10-20'],
    ['America/Los_Angeles', '2026-10-23T05:00:00Z', '2026-10-19'],
    ['Asia/Kolkata', '2026-11-02T19:00:00Z', '2026-10-31'],
    ['America/Los_Angeles', '2026-11-03T08:30:00Z', '2026-10-31'],
  ])('retains the three-local-day limit in %s at %s', (timezone, now, expected) => {
    vi.stubEnv('TZ', timezone);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));
    expect(WORKFORCE_RETROACTIVE_DAYS).toBe(3);
    expect(workforceMinDate()).toBe(expected);
  });

  it('applies the same local limit to each supported request type without changing other types', () => {
    vi.stubEnv('TZ', 'Asia/Kolkata');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-22T19:00:00Z'));
    for (const type of ['LEAVE', 'ON_DUTY', 'REGULARIZATION']) {
      expect(workforceDateInputProps(type)).toEqual({ min: '2026-10-20' });
    }
    expect(workforceDateInputProps('COMP_OFF_CREDIT')).toEqual({});
  });
});
