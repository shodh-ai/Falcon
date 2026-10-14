import { describe, expect, it } from 'vitest';
import { inclusiveCalendarDays, timeRangeMinutes } from '../quick-action-dates';

describe('quick-action duration guidance', () => {
  it('counts one-day and multi-day requests inclusively', () => {
    expect(inclusiveCalendarDays('2026-10-14', '2026-10-14')).toBe(1);
    expect(inclusiveCalendarDays('2026-10-14', '2026-10-16')).toBe(3);
  });

  it('rejects reversed and invalid dates', () => {
    expect(inclusiveCalendarDays('2026-10-16', '2026-10-14')).toBeNull();
    expect(inclusiveCalendarDays('2026-02-30', '2026-03-02')).toBeNull();
    expect(inclusiveCalendarDays('', '2026-10-14')).toBeNull();
  });

  it('shows a valid same-day meeting duration', () => {
    expect(timeRangeMinutes('10:00', '11:30')).toBe(90);
    expect(timeRangeMinutes('11:30', '10:00')).toBeNull();
  });
});
