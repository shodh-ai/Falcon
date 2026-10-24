import { ResultControlService } from './result-control.service';

describe('Result Control publication atomicity', () => {
  const session = {
    session_id: 'session',
    course_id: 'course',
    course_name: 'Synthetic course',
    exam_type: 'INTERNAL',
    semester: 6,
    pass_marks: 20,
    max_marks: 50,
    declared_at: null,
  };

  function setup(reportFails = false) {
    let committed = false;
    const managerQuery = jest.fn((sql: string) => {
      if (sql.includes('SELECT s.session_id'))
        return Promise.resolve([
          {
            ...session,
            entry_status: 'LOCKED',
            marks_locked: true,
            grading_policy_id: null,
            grading_rules: null,
          },
        ]);
      if (sql.includes('SELECT action,new_value'))
        return Promise.resolve([
          {
            action: 'RESULT_COE_AUDIT_PASSED',
            new_value: { input_hash: 'current-hash' },
          },
        ]);
      if (sql.includes('SELECT status,request_summary'))
        return Promise.resolve([
          {
            status: 'APPROVED',
            request_summary: { input_hash: 'current-hash' },
          },
        ]);
      if (sql.includes('SELECT mark_id')) {
        return Promise.resolve([
          {
            mark_id: 'mark',
            student_user_id: 'student',
            marks_obtained: '42',
            max_marks: '50',
            status: 'PENDING_COE',
          },
        ]);
      }
      if (reportFails && sql.includes('INSERT INTO student_exam_reports')) {
        return Promise.reject(new Error('report write failed'));
      }
      if (sql.includes('UPDATE exam_result_sessions') && sql.includes('SET declared_at = NOW()')) {
        return Promise.resolve([{ session_id: 'session' }]);
      }
      return Promise.resolve([]);
    });
    const query = jest.fn().mockResolvedValue([{}]);
    const transaction = jest.fn(
      async (work: (manager: unknown) => Promise<unknown>) => {
        const result = await work({ query: managerQuery });
        committed = true;
        return result;
      },
    );
    const examResultsPublished = jest.fn(() => expect(committed).toBe(true));
    const service = new ResultControlService(
      { query, transaction } as never,
      { examResultsPublished } as never,
      { log: jest.fn() } as never,
    );
    const internal = service as unknown as {
      workflowSnapshot: () => Promise<unknown>;
      latestCoeAudit: () => Promise<unknown>;
    };
    jest.spyOn(internal, 'workflowSnapshot').mockResolvedValue({
      ...session,
      entry_status: 'LOCKED',
      marks_locked: true,
      grading_rules: null,
      input_hash: 'current-hash',
      marks: [
        {
          mark_id: 'mark',
          student_user_id: 'student',
          marks_obtained: '42',
          max_marks: '50',
          status: 'PENDING_COE',
        },
      ],
    });
    jest.spyOn(internal, 'latestCoeAudit').mockResolvedValue({
      action: 'RESULT_COE_AUDIT_PASSED',
      new_value: { input_hash: 'current-hash' },
    });
    jest.spyOn(service, 'getSession').mockResolvedValue(session);
    return { service, query, transaction, managerQuery, examResultsPublished };
  }

  it('writes marks, reports, enrollment and session in one transaction before notifying', async () => {
    const test = setup();
    await expect(
      test.service.declareSession('tenant', 'session', 'actor', {}),
    ).resolves.toMatchObject({ declared: 1, session_id: 'session' });
    expect(test.transaction).toHaveBeenCalledTimes(1);
    const statements = test.managerQuery.mock.calls
      .map(([sql]) => sql)
      .join('\n');
    expect(statements).toContain('FOR UPDATE');
    expect(statements).toContain('UPDATE academic_marks');
    expect(statements).toContain('INSERT INTO academic_exam_results');
    expect(statements).toContain('INSERT INTO student_exam_reports');
    expect(statements).toContain('UPDATE student_course_enrollments');
    expect(statements).toContain('UPDATE exam_result_sessions');
    expect(test.examResultsPublished).toHaveBeenCalledTimes(1);
  });

  it('propagates report failure through the transaction and sends no publication notification', async () => {
    const test = setup(true);
    await expect(
      test.service.declareSession('tenant', 'session', 'actor', {}),
    ).rejects.toThrow('report write failed');
    expect(test.examResultsPublished).not.toHaveBeenCalled();
    expect(
      test.query.mock.calls.some(([sql]) =>
        String(sql).includes('UPDATE student_exam_reports'),
      ),
    ).toBe(false);
    expect(
      test.managerQuery.mock.calls.some(([sql]) =>
        sql.includes('UPDATE exam_result_sessions'),
      ),
    ).toBe(false);
  });
});

describe('Published result stable identity', () => {
  function service() {
    return new ResultControlService(
      {} as never,
      {} as never,
      {} as never,
    ) as unknown as {
      upsertExamResult: (manager: unknown, ...args: unknown[]) => Promise<void>;
    };
  }
  it('updates the same result UUID and grade points without deleting referenced records', async () => {
    const query = jest
      .fn<Promise<unknown[]>, [string, unknown[]?]>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ result_id: 'existing-result' }])
      .mockResolvedValue([]);
    await service().upsertExamResult(
      { query },
      'tenant',
      'student',
      'course',
      'END_TERM',
      75,
      100,
      'A',
      8,
    );
    expect(query.mock.calls[1][0]).toContain('FOR UPDATE');
    expect(query.mock.calls[2]).toEqual([
      expect.stringContaining('UPDATE academic_exam_results'),
      ['tenant', 'existing-result', 75, 100, 'A', 8],
    ]);
    expect(
      query.mock.calls.some(([sql]) => /DELETE|INSERT/.test(String(sql))),
    ).toBe(false);
  });
  it('refuses ambiguous existing identities before changing a result', async () => {
    const query = jest
      .fn<Promise<unknown[]>, [string, unknown[]?]>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ result_id: 'first' }, { result_id: 'second' }]);
    await expect(
      service().upsertExamResult(
        { query },
        'tenant',
        'student',
        'course',
        'END_TERM',
        75,
        100,
        'A',
        8,
      ),
    ).rejects.toThrow('Duplicate published result identities');
    expect(query).toHaveBeenCalledTimes(2);
  });
});
