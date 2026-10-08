import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  formatRelativeTime,
  inferIntentFromTitle,
  inferSeverityFromCategory,
  notificationSummary,
} from '@/lib/notifications/notification-display';

describe('notification-display extended branches', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('covers notificationSummary singular branches', () => {
    expect(notificationSummary(1, 1)).toBe('1 item needs your action');
    expect(notificationSummary(1, 0)).toBe('1 unread');
    expect(notificationSummary(2, 1)).toContain('2 unread');
  });

  it('covers formatRelativeTime minute, hour, day, and year branches', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T12:00:00Z'));
    expect(formatRelativeTime('2026-07-15T11:58:00Z')).toBe('2m ago');
    expect(formatRelativeTime('2026-07-15T09:00:00Z')).toBe('3h ago');
    expect(formatRelativeTime('2026-07-12T12:00:00Z')).toBe('3d ago');
    expect(formatRelativeTime('2024-07-15T12:00:00Z')).toMatch(/2024/);
  });

  it('covers infer helpers default and alert branches', () => {
    expect(inferSeverityFromCategory('HOSTEL')).toBe('info');
    expect(inferSeverityFromCategory('PLACEMENT')).toBe('success');
    expect(inferIntentFromTitle('System alert issued')).toBe('alert');
    expect(inferIntentFromTitle('Routine update')).toBe('info');
  });
});
