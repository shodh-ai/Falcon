import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ResultControlService } from './result-control.service';

describe('concerned HOD end-semester review', () => {
  const hash = 'a'.repeat(64);
  const snapshot = {
    session_id: 'session', course_id: 'course', course_code: 'P101', course_name: 'Pharmacy',
    exam_type: 'ETE', semester: 1, max_marks: 40, owner_department_id: 9,
    entry_status: 'LOCKED', marks_locked: true, declared_at: null, input_hash: hash,
    marks: [{ mark_id: 'mark', student_user_id: 'student', marks_obtained: '30', max_marks: '40', status: 'PENDING_COE' }],
  };

  function setup(options: { hodOwns?: boolean; roster?: boolean; ownMark?: boolean; outside?: boolean; ambiguous?: boolean; existing?: string } = {}) {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('SELECT d.dept_id AS department_id')) return options.hodOwns === false ? [] : [{ department_id: 9 }];
      if (sql.includes('session_id<>$4')) return options.ambiguous ? [{ session_id: 'other' }] : [];
      if (sql.includes('SELECT e.student_user_id FROM student_course_enrollments')) {
        if (sql.includes('LIMIT 1')) return options.outside ? [{ student_user_id: 'outside' }] : [];
        return options.roster === false ? [] : [{ student_user_id: 'student' }];
      }
      if (sql.includes('SELECT mark_id FROM academic_marks')) return options.ownMark ? [{ mark_id: 'mark' }] : [];
      if (sql.includes('FROM exam_result_hod_decisions')) return options.existing ? [{ decision_id: 'prior', decision: options.existing }] : [];
      if (sql.includes('INSERT INTO exam_result_hod_decisions')) return [{ decision_id: 'decision' }];
      return [];
    });
    const db = { query, transaction: jest.fn(async (work: (tx: { query: typeof query }) => Promise<unknown>) => work({ query })) };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new ResultControlService(db as never, {} as never, audit as never);
    jest.spyOn(service as never, 'workflowSnapshot').mockResolvedValue(snapshot as never);
    return { service, query, audit };
  }

  it('approves the exact submitted roster for the department without publishing it', async () => {
    const { service, query, audit } = setup();
    await expect(service.decideHodEndTermSession('tenant', 'session', 'hod', 'APPROVED', hash))
      .resolves.toMatchObject({ status: 'APPROVED', input_hash: hash });
    expect(query.mock.calls.some(([sql]) => sql.includes('UPDATE academic_marks'))).toBe(false);
    expect(audit.log).toHaveBeenCalledWith('tenant', 'hod', expect.objectContaining({ action: 'RESULT_HOD_APPROVED' }), expect.anything());
  });

  it('blocks cross-department, stale, incomplete, and self approval', async () => {
    await expect(setup({ hodOwns: false }).service.decideHodEndTermSession('tenant', 'session', 'other', 'APPROVED', hash))
      .rejects.toBeInstanceOf(NotFoundException);
    await expect(setup().service.decideHodEndTermSession('tenant', 'session', 'hod', 'APPROVED', 'b'.repeat(64)))
      .rejects.toThrow('Marks changed');
    await expect(setup({ roster: false }).service.decideHodEndTermSession('tenant', 'session', 'hod', 'APPROVED', hash))
      .rejects.toThrow('Every enrolled student');
    await expect(setup({ outside: true }).service.decideHodEndTermSession('tenant', 'session', 'hod', 'APPROVED', hash))
      .rejects.toThrow('Cross-department');
    await expect(setup({ ambiguous: true }).service.decideHodEndTermSession('tenant', 'session', 'hod', 'APPROVED', hash))
      .rejects.toThrow('Multiple sessions');
    await expect(setup({ ownMark: true }).service.decideHodEndTermSession('tenant', 'session', 'hod', 'APPROVED', hash))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires a rejection reason and forbids reversing the same revision', async () => {
    await expect(setup().service.decideHodEndTermSession('tenant', 'session', 'hod', 'REJECTED', hash))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(setup({ existing: 'REJECTED' }).service.decideHodEndTermSession('tenant', 'session', 'hod', 'APPROVED', hash))
      .rejects.toThrow('already has a HOD decision');
  });
});
