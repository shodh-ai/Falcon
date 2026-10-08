import { describe, it, expect } from 'vitest';
import { canExamCellAction, hasExamCellPortalAccess } from '@/lib/exam-cell-rbac';

describe('exam-cell-rbac branch coverage', () => {
  it('accepts role arrays for portal access', () => {
    expect(hasExamCellPortalAccess(['faculty', 'examoperator'])).toBe(true);
    expect(canExamCellAction(['examadmin', 'faculty'], 'manage_schedules')).toBe(true);
  });

  it('handles null roles safely', () => {
    expect(hasExamCellPortalAccess(null)).toBe(false);
    expect(canExamCellAction(undefined, 'view_dashboard')).toBe(false);
  });
});
