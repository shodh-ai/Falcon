import { describe, expect, it } from 'vitest';
import { formatTeachingDuration } from '../workload-duration';

describe('teaching duration display', () => {
  it('shows three 50-minute theory classes and three 3-hour labs as 11 hr 30 min', () => {
    expect(formatTeachingDuration((3 * 50 + 3 * 180) / 60)).toBe('11 hr 30 min');
  });
  it('shows the imported 50+60+50-minute theory timetable plus labs as 11 hr 40 min', () => {
    expect(formatTeachingDuration((50 + 60 + 50 + 3 * 180) / 60)).toBe('11 hr 40 min');
  });
  it('rounds minute carry without exposing floating-point digits', () => {
    expect(formatTeachingDuration(1.999999999)).toBe('2 hr 0 min');
    expect(formatTeachingDuration(0)).toBe('0 hr 0 min');
  });
  it('does not portray missing or invalid time as a measured zero', () => {
    for (const hours of [null, undefined, NaN, Infinity, -1]) expect(formatTeachingDuration(hours)).toBe('—');
  });
});
