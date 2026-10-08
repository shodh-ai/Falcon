import {
  assertExamCellAction,
  canExamCellAction,
  normalizeExamCellRole,
} from '../../../backend/src/modules/exam-cell/exam-cell-rbac.util';

describe('Exam Cell RBAC (backend util)', () => {
  it('normalizes role names', () => {
    expect(normalizeExamCellRole(' Exam Cell ')).toBe('examcell');
    expect(normalizeExamCellRole('Deputy COE')).toBe('deputycoe');
  });

  it('grants examcell full actions', () => {
    expect(canExamCellAction('examcell', 'publish_results')).toBe(true);
    expect(canExamCellAction('examcell', 'manage_qp')).toBe(true);
  });

  it('restricts examoperator from publishing results', () => {
    expect(canExamCellAction('examoperator', 'manage_seating')).toBe(true);
    expect(canExamCellAction('examoperator', 'publish_results')).toBe(false);
  });

  it('restricts examadmin from UFM approval', () => {
    expect(canExamCellAction('examadmin', 'manage_schedules')).toBe(true);
    expect(canExamCellAction('examadmin', 'approve_ufm')).toBe(false);
  });

  it('throws ForbiddenException on denied action', () => {
    expect(() => assertExamCellAction('examoperator', 'publish_results')).toThrow(/permission/i);
  });
});
