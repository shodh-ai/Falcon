import { EXAM_CELL_API, EXAM_CELL_ROUTES } from '../../helpers/workflow-routes';
import { canExamCellAction } from '../../../backend/src/modules/exam-cell/exam-cell-rbac.util';

describe('Examination Cell workspace registry', () => {
  it('defines exam operations pages', () => {
    expect(EXAM_CELL_ROUTES.hallTickets).toContain('admit-cards');
    expect(EXAM_CELL_ROUTES.gradeCards).toContain('grade-cards');
  });

  it('maps exam cell APIs', () => {
    expect(EXAM_CELL_API.dashboard).toBe('/api/exam-cell/dashboard');
    expect(EXAM_CELL_API.auditLog).toContain('audit-log');
  });

  it('aligns COE publish permission with RBAC util', () => {
    expect(canExamCellAction('examcell', 'publish_results')).toBe(true);
    expect(canExamCellAction('examoperator', 'publish_results')).toBe(false);
  });
});
