import {
  canExamCellAction,
  examCellRoleFromUser,
  normalizeExamCellRole,
} from '../../../backend/src/modules/exam-cell/exam-cell-rbac.util';

describe('Exam Cell RBAC extended branches', () => {
  it('examCellRoleFromUser prefers primaryRole', () => {
    expect(
      examCellRoleFromUser({ role: 'examoperator', primaryRole: 'examcell' }),
    ).toBe('examcell');
  });

  it('denies unknown roles', () => {
    expect(canExamCellAction(normalizeExamCellRole('unknown'), 'manage_qp')).toBe(
      false,
    );
  });

  it('grants superadmin publish_results', () => {
    expect(canExamCellAction('superadmin', 'publish_results')).toBe(true);
  });

  it('grants deputycoe manage_qp denial', () => {
    expect(canExamCellAction('deputycoe', 'manage_qp')).toBe(false);
  });
});
