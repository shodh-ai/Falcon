import { afterEach, describe, expect, it, vi } from 'vitest';
import { calendarDateKey, formatCalendarDate, localTodayKey } from '../calendar-date';

afterEach(() => vi.unstubAllEnvs());

describe('faculty calendar dates', () => {
  it.each(['America/Los_Angeles', 'Asia/Kolkata', 'Pacific/Kiritimati'])(
    'keeps a database calendar date unchanged in %s',
    (timezone) => {
      vi.stubEnv('TZ', timezone);
      expect(calendarDateKey('2026-10-23')).toBe('2026-10-23');
      expect(formatCalendarDate('2026-10-23')).toBe('23 Oct 2026');
      expect(formatCalendarDate('2026-10-23', { day: '2-digit', month: '2-digit', year: 'numeric' })).toBe('23/10/2026');
    },
  );

  it('retains the literal date of a legacy ISO value across UTC date boundaries', () => {
    const legacy = '2026-10-23T23:30:00-07:00';
    expect(new Date(legacy).toISOString().slice(0, 10)).toBe('2026-10-24');
    expect(calendarDateKey(legacy)).toBe('2026-10-23');
    expect(formatCalendarDate(legacy)).toBe('23 Oct 2026');
    expect(calendarDateKey('2026-10-23T00:15:00+14:00')).toBe('2026-10-23');
  });

  it('keeps formatting tied to the calendar date even if a caller supplies another timezone', () => {
    expect(formatCalendarDate('2026-10-23', {
      day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Pacific/Honolulu',
    })).toBe('23/10/2026');
  });

  it.each(['', 'not a date', '23/10/2026', '2026-2-3', '2026-02-29', '2026-04-31', '2026-13-01', '2026-10-23junk', '2026-10-23T25:00:00Z'])(
    'rejects invalid calendar input %j without displaying a shifted or invented date',
    (value) => {
      expect(calendarDateKey(value)).toBeNull();
      expect(formatCalendarDate(value)).toBe('Date unavailable');
    },
  );

  it('accepts leap days only in leap years and keys sort by calendar day', () => {
    expect(calendarDateKey('2024-02-29')).toBe('2024-02-29');
    expect(calendarDateKey('2000-02-29')).toBe('2000-02-29');
    expect(calendarDateKey('1900-02-29')).toBeNull();
    const keys = ['2026-11-01', '2026-10-23', '2026-10-09'].map((value) => calendarDateKey(value)!);
    expect(keys.sort()).toEqual(['2026-10-09', '2026-10-23', '2026-11-01']);
  });

  it.each([
    ['Asia/Kolkata', '2026-10-22T20:00:00Z', '2026-10-23'],
    ['America/Los_Angeles', '2026-10-23T01:00:00Z', '2026-10-22'],
  ])('uses the local calendar day in %s instead of the UTC date', (timezone, instant, expected) => {
    vi.stubEnv('TZ', timezone);
    expect(localTodayKey(new Date(instant))).toBe(expected);
  });

  it('rejects an invalid clock value rather than creating an unusable comparison key', () => {
    expect(() => localTodayKey(new Date('invalid'))).toThrow(RangeError);
  });
});
