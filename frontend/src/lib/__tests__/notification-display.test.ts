import { describe, it, expect } from 'vitest';
import {
  categoryLabel,
  defaultActionLabel,
  formatRelativeTime,
  inferIntentFromTitle,
  inferSeverityFromCategory,
  notificationSummary,
  resolveIntent,
  resolveSeverity,
} from '@/lib/notifications/notification-display';

describe('notification-display utilities', () => {
  it('formats category labels', () => {
    expect(categoryLabel('ACADEMICS')).toBe('Academics');
    expect(categoryLabel('CUSTOM_TYPE')).toBe('CUSTOM TYPE');
  });

  it('resolves severity and intent with fallbacks', () => {
    expect(resolveSeverity('critical')).toBe('critical');
    expect(resolveSeverity('bogus')).toBe('info');
    expect(resolveIntent('action_required')).toBe('action_required');
    expect(resolveIntent(null)).toBe('info');
  });

  it('builds notification summary strings', () => {
    expect(notificationSummary(0, 0)).toBeNull();
    expect(notificationSummary(2, 2)).toContain('need your action');
    expect(notificationSummary(3, 1)).toContain('unread');
  });

  it('infers severity and intent from legacy fields', () => {
    expect(inferSeverityFromCategory('FINANCE')).toBe('warning');
    expect(inferIntentFromTitle('Approval pending for leave')).toBe('action_required');
    expect(inferIntentFromTitle('Results published')).toBe('status_update');
  });

  it('defaultActionLabel respects overrides', () => {
    expect(defaultActionLabel('action_required', 'Review')).toBe('Review');
    expect(defaultActionLabel('info', null)).toBe('View details');
  });

  it('formatRelativeTime handles invalid dates', () => {
    expect(formatRelativeTime(null)).toBe('');
    expect(formatRelativeTime('not-a-date')).toBe('');
  });
});
