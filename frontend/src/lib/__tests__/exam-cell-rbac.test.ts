import { describe, it, expect } from 'vitest';
import {
  canExamCellAction,
  hasExamCellPortalAccess,
  normalizeExamCellRole,
} from '@/lib/exam-cell-rbac';

describe('Exam Cell RBAC (frontend)', () => {
  it('normalizes roles consistently with backend', () => {
    expect(normalizeExamCellRole('Exam Cell')).toBe('examcell');
  });

  it('grants portal access to exam roles', () => {
    expect(hasExamCellPortalAccess('examcell')).toBe(true);
    expect(hasExamCellPortalAccess('examoperator')).toBe(true);
    expect(hasExamCellPortalAccess('faculty')).toBe(false);
  });

  it('restricts operator publish_results', () => {
    expect(canExamCellAction('examoperator', 'publish_results')).toBe(false);
    expect(canExamCellAction(['examcell'], 'publish_results')).toBe(true);
  });

  it('allows deputy COE UFM approval', () => {
    expect(canExamCellAction('deputycoe', 'approve_ufm')).toBe(true);
    expect(canExamCellAction('examadmin', 'approve_ufm')).toBe(false);
  });
});
