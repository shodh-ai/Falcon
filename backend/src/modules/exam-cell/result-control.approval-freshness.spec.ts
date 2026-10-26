import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ResultControlService } from './result-control.service';
import { parseGradeBands } from './grading-engine';
import {
  resultApprovalState,
  type ResultApprovalMark,
  type ResultApprovalSession,
} from './result-approval-state';

const tenantId = 'tenant-a';
const sessionId = 'session-a';
const courseId = 'course-a';
const examActor = 'exam-officer';
const deanActor = 'dean-a';
type Request = {
  request_id: string;
  session_id: string;
  tenant_id: string;
  status: string;
  request_summary: Record<string, unknown> | null;
};
type AuditEvent = { action: string; new_value?: Record<string, unknown> };
type Enrollment = {
  enrollment_id: string;
  tenant_id: string;
  course_id: string;
  student_user_id: string;
  semester: number;
  deleted_at: string | null;
  status: string;
  grade: string | null;
  grade_points: number | null;
};

function enrollment(studentUserId = 'student-a'): Enrollment {
  return {
    enrollment_id: `enrollment-${studentUserId}`,
    tenant_id: tenantId,
    course_id: courseId,
    student_user_id: studentUserId,
    semester: 4,
    deleted_at: null,
    status: 'ENROLLED',
    grade: null,
    grade_points: null,
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** In-memory rollback/serialization is test scaffolding, not a real database lock. */
function setup(
  options: {
    failAudit?: string;
    failDecisionCas?: boolean;
    failDeclarationCas?: boolean;
    failEnrollmentUpdate?: boolean;
  } = {},
) {
  // Installed PostgresQueryRunner returns UPDATE/DELETE as [rows, affectedCount],
  // including [[], 0] when a conditional UPDATE did not match any record.
  const updateResult = (rows: unknown[] = [], affectedCount = rows.length) => [
    rows,
    affectedCount,
  ];
  const state = {
    session: {
      session_id: sessionId,
      tenant_id: tenantId,
      course_id: courseId,
      course_code: 'CS101',
      course_name: 'Algorithms',
      exam_type: 'END_TERM',
      semester: 4,
      max_marks: 100,
      pass_marks: 40,
      grading_policy_id: null,
      entry_status: 'LOCKED',
      marks_locked: true,
      marks_locked_at: '2026-10-21T08:00:00.123456Z',
      declared_at: null,
    } as ResultApprovalSession,
    marks: [
      {
        mark_id: 'mark-a',
        student_user_id: 'student-a',
        marks_obtained: 80,
        max_marks: 100,
        status: 'PENDING_COE',
        updated_at: '2026-10-21T07:00:00.123456Z',
        revision: '1001',
      },
    ] as ResultApprovalMark[],
    policy: { rules: {} as Record<string, unknown>, revision: '2001' },
    requests: [] as Request[],
    audits: [] as AuditEvent[],
    history: [] as unknown[][],
    reports: [] as unknown[][],
    enrollments: [enrollment()],
  };
  const events: string[] = [];
  const currentState = () => {
    const rules =
      state.session.grading_policy_id == null ? null : state.policy.rules;
    return resultApprovalState(
      state.session,
      state.marks.filter((mark) => mark.status === 'PENDING_COE'),
      { rules, bands: parseGradeBands(rules) },
      state.session.grading_policy_id == null
        ? undefined
        : state.policy.revision,
    );
  };
  const refreshCoe = () =>
    state.audits.push({
      action: 'RESULT_COE_AUDIT_PASSED',
      new_value: { result_state: currentState() },
    });
  const seedApproval = (status = 'APPROVED') => {
    const request: Request = {
      request_id: `request-${state.requests.length + 1}`,
      session_id: sessionId,
      tenant_id: tenantId,
      status,
      request_summary: { result_state: currentState() },
    };
    state.requests.push(request);
    return request;
  };
  const scopedSession = (tenant: unknown, id: unknown) =>
    tenant === state.session.tenant_id && id === state.session.session_id;
  const manager = {
    query: jest.fn(
      async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
        if (sql.includes('pg_advisory_xact_lock')) return [];
        if (sql.includes('FROM exam_result_sessions')) {
          if (sql.includes('semester = $4')) {
            return params[0] === state.session.tenant_id &&
              params[1] === state.session.course_id &&
              params[2] === state.session.exam_type &&
              params[3] === state.session.semester
              ? [clone(state.session)]
              : [];
          }
          return scopedSession(params[0], params[1])
            ? [clone(state.session)]
            : [];
        }
        if (sql.includes('FROM academic_grading_policies')) {
          return params[0] === state.session.grading_policy_id
            ? [clone(state.policy)]
            : [];
        }
        if (sql.includes('FROM academic_marks')) {
          const matches =
            params[0] === state.session.tenant_id &&
            params[1] === state.session.course_id &&
            params[2] === state.session.exam_type;
          const marks = matches
            ? state.marks.filter((mark) => mark.status === 'PENDING_COE')
            : [];
          return sql.includes('COUNT(*)')
            ? [{ c: marks.length }]
            : clone(marks);
        }
        if (sql.includes('FROM student_course_enrollments')) {
          const studentIds = params[3] as string[];
          return clone(
            state.enrollments.filter(
              (row) =>
                row.tenant_id === params[0] &&
                row.course_id === params[1] &&
                row.semester === params[2] &&
                studentIds.includes(row.student_user_id) &&
                row.deleted_at === null,
            ),
          );
        }
        if (sql.includes('FROM exam_result_dean_approval_requests')) {
          const byRequest = sql.includes('request_id = $2');
          const rows = state.requests.filter(
            (request) =>
              request.tenant_id === params[0] &&
              (byRequest
                ? request.request_id === params[1] &&
                  request.status === 'PENDING'
                : request.session_id === params[1]),
          );
          return clone(rows.slice(-1));
        }
        if (sql.includes('FROM exam_audit_logs')) {
          if (!scopedSession(params[0], params[1])) return [];
          return clone(
            state.audits
              .filter((event) =>
                [
                  'RESULT_COE_AUDIT_PASSED',
                  'RESULT_COE_AUDIT_ANOMALY',
                  'RESULT_INPUTS_CHANGED',
                ].includes(event.action),
              )
              .slice(-1),
          );
        }
        if (sql.includes('UPDATE exam_result_dean_approval_requests')) {
          if (sql.includes('invalidated_at')) {
            const rows = state.requests.filter(
              (request) =>
                request.tenant_id === params[0] &&
                request.session_id === params[1] &&
                ['PENDING', 'APPROVED'].includes(request.status),
            );
            for (const row of rows) {
              row.status = 'REJECTED';
              row.request_summary = {
                ...row.request_summary,
                invalidation_reason: params[2],
              };
            }
            return updateResult(rows.map(({ request_id }) => ({ request_id })));
          }
          const row = state.requests.find(
            (request) =>
              request.request_id === params[0] &&
              request.tenant_id === params[1] &&
              request.status === 'PENDING',
          );
          if (!row || options.failDecisionCas) return updateResult();
          row.status = String(params[2]);
          return updateResult([{ request_id: row.request_id }]);
        }
        if (sql.includes('INSERT INTO exam_result_dean_approval_requests')) {
          const request: Request = {
            request_id: `request-${state.requests.length + 1}`,
            tenant_id: String(params[0]),
            session_id: String(params[1]),
            status: 'PENDING',
            request_summary: JSON.parse(String(params[3])) as Record<
              string,
              unknown
            >,
          };
          state.requests.push(request);
          return [{ request_id: request.request_id, status: request.status }];
        }
        if (sql.includes('INSERT INTO exam_result_dean_approval_history')) {
          if (typeof params[0] !== 'string' || !params[0]) {
            throw new Error('Approval history requires a request_id');
          }
          state.history.push(params);
          return [];
        }
        if (sql.includes('INSERT INTO exam_result_sessions')) {
          state.session.max_marks = params[4] as number;
          if (params[5] != null) state.session.pass_marks = params[5] as number;
          if (params[6] != null)
            state.session.grading_policy_id = params[6] as number;
          return [clone(state.session)];
        }
        if (sql.includes('UPDATE exam_result_sessions')) {
          if (sql.includes('declared_at = NOW()')) {
            if (state.session.declared_at || options.failDeclarationCas)
              return updateResult();
            state.session.declared_at = '2026-10-21T09:00:00Z';
          } else if (sql.includes("entry_status = 'OPEN'")) {
            state.session.entry_status = 'OPEN';
            state.session.marks_locked = false;
            state.session.marks_locked_at = null;
          } else if (sql.includes('pass_marks = COALESCE')) {
            if (params[1] != null)
              state.session.pass_marks = params[1] as number;
            if (params[2] != null)
              state.session.grading_policy_id = params[2] as number;
            if (params[3] != null)
              state.session.max_marks = params[3] as number;
          } else if (sql.includes("entry_status = 'LOCKED'")) {
            state.session.entry_status = 'LOCKED';
            state.session.marks_locked = true;
            state.session.marks_locked_at = '2026-10-21T09:00:00Z';
          } else if (sql.includes("entry_status = 'CLOSED'")) {
            state.session.entry_status = 'CLOSED';
          }
          return updateResult(
            sql.includes('RETURNING session_id')
              ? [{ session_id: sessionId }]
              : [],
            1,
          );
        }
        if (sql.includes('UPDATE academic_marks')) {
          let affected = 0;
          if (sql.includes("status = 'PUBLISHED'")) {
            const mark = state.marks.find((row) => row.mark_id === params[1]);
            if (mark) {
              mark.status = 'PUBLISHED';
              affected += 1;
            }
          } else if (sql.includes("status = 'DRAFT'")) {
            for (const mark of state.marks)
              if (mark.status === 'PENDING_COE') {
                mark.status = 'DRAFT';
                affected += 1;
              }
          } else if (sql.includes('marks_obtained = $2')) {
            const mark = state.marks.find((row) => row.mark_id === params[0]);
            if (mark) {
              mark.marks_obtained = params[1] as number;
              mark.revision = '1002';
              affected += 1;
            }
          }
          return updateResult([], affected);
        }
        if (sql.includes('INSERT INTO student_exam_reports')) {
          state.reports.push(params);
          return [];
        }
        if (sql.includes('UPDATE student_course_enrollments')) {
          if (options.failEnrollmentUpdate) return updateResult();
          const rows = state.enrollments.filter(
            (row) =>
              row.tenant_id === params[0] &&
              row.student_user_id === params[1] &&
              row.course_id === params[2] &&
              row.semester === params[6] &&
              row.deleted_at === null,
          );
          for (const row of rows) {
            row.grade = String(params[3]);
            row.grade_points = Number(params[4]);
            row.status = params[5] === 'PASS' ? 'COMPLETED' : 'FAILED';
          }
          return updateResult(
            rows.map(({ enrollment_id }) => ({ enrollment_id })),
          );
        }
        if (sql.includes('DELETE FROM academic_exam_results'))
          return updateResult();
        if (sql.includes('INSERT INTO academic_exam_results')) return [];
        throw new Error(`Unexpected transaction query: ${sql}`);
      },
    ),
  };
  let queue: Promise<unknown> = Promise.resolve();
  const db = {
    query: jest.fn(
      async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
        if (
          sql.includes('FROM exam_result_sessions') ||
          sql.includes('FROM academic_marks') ||
          sql.includes('FROM academic_grading_policies') ||
          sql.includes('FROM student_course_enrollments') ||
          sql.includes('FROM exam_result_dean_approval_requests') ||
          sql.includes('FROM exam_audit_logs')
        )
          return manager.query(sql, params);
        if (sql.includes('FROM academic_courses'))
          return params[0] === courseId && params[1] === tenantId
            ? [{ course_id: courseId }]
            : [];
        if (sql.includes('FROM users u')) return [{ user_id: deanActor }];
        throw new Error(`Unexpected global query: ${sql}`);
      },
    ),
    transaction: jest.fn(
      (work: (executor: typeof manager) => Promise<unknown>) => {
        const operation = queue.then(async () => {
          const before = clone(state);
          events.push('begin');
          try {
            const value = await work(manager);
            events.push('commit');
            return value;
          } catch (error) {
            Object.assign(state, before);
            events.push('rollback');
            throw error;
          }
        });
        queue = operation.catch(() => undefined);
        return operation;
      },
    ),
  };
  const audit = {
    hasAction: jest.fn().mockResolvedValue(true),
    log: jest.fn(
      async (
        _tenant: string,
        _actor: string | undefined,
        payload: AuditEvent,
        executor?: unknown,
      ) => {
        if (payload.action === options.failAudit)
          throw new Error('audit write failed');
        if (executor && executor !== manager)
          throw new Error('Wrong audit transaction');
        state.audits.push(clone(payload));
        events.push(`audit:${payload.action}`);
      },
    ),
  };
  const notify = {
    approvalRequired: jest.fn(() => events.push('notify:dean')),
    examResultsPublished: jest.fn(() => events.push('notify:student')),
  };
  const service = new ResultControlService(
    db as never,
    notify as never,
    audit as never,
  );
  const request = () =>
    service.requestDeanApproval(tenantId, sessionId, examActor);
  const decide = (
    requestId: string,
    decision: 'APPROVED' | 'REJECTED' = 'APPROVED',
    role = 'SuperAdmin',
  ) =>
    service.decideDeanResultApproval(
      tenantId,
      deanActor,
      requestId,
      decision,
      undefined,
      role,
    );
  const declare = () =>
    service.declareSession(tenantId, sessionId, examActor, {});
  const writes = () =>
    manager.query.mock.calls.filter(([sql]) =>
      /^\s*(INSERT|UPDATE|DELETE)\b/.test(sql),
    );
  refreshCoe();
  return {
    state,
    service,
    manager,
    db,
    audit,
    notify,
    events,
    currentState,
    refreshCoe,
    seedApproval,
    request,
    decide,
    declare,
    writes,
  };
}

describe('Result approval freshness (mocked database)', () => {
  it('requests, approves and declares exactly the currently locked batch', async () => {
    const h = setup();
    const requested = await h.request();
    expect(h.state.requests[0].request_summary?.result_state).toEqual(
      h.currentState(),
    );
    await expect(h.decide(requested.request_id)).resolves.toMatchObject({
      status: 'APPROVED',
    });
    await expect(h.declare()).resolves.toMatchObject({
      declared: 1,
      session_id: sessionId,
    });
    expect(h.state.reports).toHaveLength(1);
    expect(h.state.marks[0].status).toBe('PUBLISHED');
    expect(h.state.session.declared_at).toBeTruthy();
    expect(h.notify.examResultsPublished).toHaveBeenCalledTimes(1);
    expect(h.audit.hasAction).not.toHaveBeenCalled();
    expect(h.audit.log).toHaveBeenCalledWith(
      tenantId,
      deanActor,
      expect.objectContaining({ action: 'RESULT_DEAN_APPROVED' }),
      h.manager,
    );
  });

  const invalidRosterCases: Array<
    [string, (h: ReturnType<typeof setup>) => void]
  > = [
    ['missing enrollment', (h) => (h.state.enrollments = [])],
    [
      'wrong semester',
      (h) => {
        h.state.enrollments[0].semester = 5;
      },
    ],
    [
      'another tenant',
      (h) => {
        h.state.enrollments[0].tenant_id = 'tenant-b';
      },
    ],
    [
      'another course',
      (h) => {
        h.state.enrollments[0].course_id = 'course-b';
      },
    ],
    [
      'another student',
      (h) => {
        h.state.enrollments[0].student_user_id = 'student-b';
      },
    ],
    [
      'deleted enrollment',
      (h) => {
        h.state.enrollments[0].deleted_at = '2026-10-21T09:00:00Z';
      },
    ],
  ];

  it.each(invalidRosterCases)(
    'rejects declaration with %s even when existing approval fingerprints match',
    async (_label, invalidateRoster) => {
      const h = setup();
      h.seedApproval();
      const approvedState = h.currentState();
      invalidateRoster(h);
      expect(h.currentState()).toEqual(approvedState);

      await expect(h.declare()).rejects.toThrow(
        'Result batch contains students without a matching course enrollment for this semester',
      );

      expect(h.writes()).toHaveLength(0);
      expect(h.state.reports).toHaveLength(0);
      expect(h.state.marks[0].status).toBe('PENDING_COE');
      expect(h.state.session.declared_at).toBeNull();
      expect(h.notify.examResultsPublished).not.toHaveBeenCalled();
    },
  );

  it.each(['COE audit', 'approval request', 'Dean decision'] as const)(
    'rejects a wrong-semester batch at %s before recording approval',
    async (stage) => {
      const h = setup();
      const pending = h.seedApproval('PENDING');
      h.state.enrollments[0].semester = 5;
      const before = clone(h.state);
      const action =
        stage === 'COE audit'
          ? () => h.service.runFormulaAudit(tenantId, sessionId, examActor)
          : stage === 'approval request'
            ? h.request
            : () => h.decide(pending.request_id);

      await expect(action()).rejects.toThrow(
        'Result batch contains students without a matching course enrollment for this semester',
      );

      expect(h.state).toEqual(before);
      expect(h.writes()).toHaveLength(0);
      expect(h.audit.log).not.toHaveBeenCalled();
      expect(h.notify.approvalRequired).not.toHaveBeenCalled();
    },
  );

  it('rejects an entire mixed-semester batch instead of publishing the valid subset', async () => {
    const h = setup();
    h.state.marks.push({
      ...h.state.marks[0],
      mark_id: 'mark-b',
      student_user_id: 'student-b',
    });
    h.state.enrollments.push({ ...enrollment('student-b'), semester: 5 });
    h.refreshCoe();
    h.seedApproval();
    const before = clone(h.state);

    await expect(h.declare()).rejects.toThrow(
      'Result batch contains students without a matching course enrollment for this semester',
    );

    expect(h.writes()).toHaveLength(0);
    expect(h.state.enrollments).toEqual(before.enrollments);
    expect(h.state.marks).toEqual(before.marks);
    expect(h.state.reports).toHaveLength(0);
    expect(h.notify.examResultsPublished).not.toHaveBeenCalled();
  });

  it.each(['COMPLETED', 'FAILED'])(
    'preserves existing result processing for a matching %s enrollment',
    async (status) => {
      const h = setup();
      h.state.enrollments[0].status = status;
      h.seedApproval();

      await expect(h.declare()).resolves.toMatchObject({ declared: 1 });

      expect(h.state.enrollments[0].grade).not.toBeNull();
      expect(h.state.enrollments[0].status).toBe('COMPLETED');
      expect(h.state.reports).toHaveLength(1);
    },
  );

  it('shows invalid current roster approval as unavailable without breaking the session page', async () => {
    const h = setup();
    h.seedApproval();
    h.state.enrollments[0].semester = 5;

    await expect(
      h.service.getSession(tenantId, sessionId),
    ).resolves.toMatchObject({
      session_id: sessionId,
      coe_audit_status: 'idle',
      dean_approved: false,
    });

    expect(h.db.transaction).not.toHaveBeenCalled();
    expect(h.writes()).toHaveLength(0);
    expect(
      h.manager.query.mock.calls.some(([sql]) => sql.includes('FOR UPDATE')),
    ).toBe(false);
  });

  it('rolls back the complete publication when the expected enrollment grade update matches no record', async () => {
    const h = setup({ failEnrollmentUpdate: true });
    h.seedApproval();
    const before = clone(h.state);

    await expect(h.declare()).rejects.toThrow(
      'Expected exactly one enrollment grade update for each declared student',
    );

    expect(h.state.reports).toEqual(before.reports);
    expect(h.state.marks).toEqual(before.marks);
    expect(h.state.enrollments).toEqual(before.enrollments);
    expect(h.state.session.declared_at).toBeNull();
    expect(h.events).toContain('rollback');
    expect(h.events).not.toContain('commit');
    expect(h.notify.examResultsPublished).not.toHaveBeenCalled();
    expect(
      h.state.audits.some((event) => event.action === 'RESULT_DECLARED'),
    ).toBe(false);
  });

  const changedInputs: Array<[string, (h: ReturnType<typeof setup>) => void]> =
    [
      [
        'marks value',
        (h) => {
          h.state.marks[0].marks_obtained = 81;
        },
      ],
      [
        'marks maximum',
        (h) => {
          h.state.marks[0].max_marks = 90;
        },
      ],
      [
        'student identity',
        (h) => {
          h.state.marks[0].student_user_id = 'student-b';
          h.state.enrollments = [enrollment('student-b')];
        },
      ],
      [
        'student batch membership',
        (h) => {
          h.state.marks.push({
            ...h.state.marks[0],
            mark_id: 'mark-b',
            student_user_id: 'student-b',
          });
          h.state.enrollments.push(enrollment('student-b'));
        },
      ],
      [
        'mark row revision',
        (h) => {
          h.state.marks[0].revision = '1002';
        },
      ],
      [
        'mark timestamp microseconds',
        (h) => {
          h.state.marks[0].updated_at = '2026-10-21T07:00:00.123457Z';
        },
      ],
      [
        'passing marks',
        (h) => {
          h.state.session.pass_marks = 41;
        },
      ],
      [
        'session maximum',
        (h) => {
          h.state.session.max_marks = 99;
        },
      ],
      [
        'grading policy identity',
        (h) => {
          h.state.session.grading_policy_id = 2;
        },
      ],
      [
        'grading policy rules',
        (h) => {
          h.state.policy.rules = { minimumPass: 50 };
        },
      ],
      [
        'grading policy row revision',
        (h) => {
          h.state.policy.revision = '2002';
        },
      ],
      [
        'semester',
        (h) => {
          h.state.session.semester = 5;
          h.state.enrollments[0].semester = 5;
        },
      ],
      [
        'lock generation',
        (h) => {
          h.state.session.marks_locked_at = '2026-10-21T08:00:00.123457Z';
        },
      ],
    ];
  it.each(changedInputs)(
    'rejects old Dean approval after changing %s even with a fresh COE audit',
    async (_label, change) => {
      const h = setup();
      h.state.session.grading_policy_id = 1;
      h.refreshCoe();
      h.seedApproval();
      change(h);
      h.refreshCoe();
      await expect(h.declare()).rejects.toThrow('Dean approval is stale');
      expect(h.writes()).toHaveLength(0);
      expect(h.notify.examResultsPublished).not.toHaveBeenCalled();
    },
  );

  it.each([
    'tenant_id',
    'session_id',
    'course_id',
    'exam_type',
    'semester',
  ] as const)(
    'rejects approval evidence copied from a different %s',
    async (field) => {
      const h = setup();
      const approval = h.seedApproval();
      const foreign = {
        ...h.state.session,
        [field]: field === 'semester' ? 8 : 'other-scope',
      };
      approval.request_summary = {
        result_state: resultApprovalState(foreign, h.state.marks, {
          rules: null,
          bands: parseGradeBands(null),
        }),
      };
      await expect(h.declare()).rejects.toThrow('Dean approval is stale');
      expect(h.writes()).toHaveLength(0);
    },
  );

  it.each(['tenant_id', 'session_id'] as const)(
    'cannot use another scope approval row (%s)',
    async (field) => {
      const h = setup();
      h.seedApproval()[field] = 'other-scope';
      await expect(h.declare()).rejects.toThrow('Dean approval is required');
      expect(h.writes()).toHaveLength(0);
    },
  );

  it.each([null, {}, { result_state: { version: 0, digest: 'a'.repeat(64) } }])(
    'rejects legacy/unverified approval and never falls back to historical audit: %j',
    async (summary) => {
      const h = setup();
      h.seedApproval().request_summary = summary;
      await expect(h.declare()).rejects.toThrow('Dean approval is stale');
      expect(h.audit.hasAction).not.toHaveBeenCalled();
      expect(h.notify.examResultsPublished).not.toHaveBeenCalled();
    },
  );

  it.each(['REJECTED', 'PENDING'])(
    'does not reuse older approval when latest request is %s',
    async (status) => {
      const h = setup();
      h.seedApproval();
      h.seedApproval(status);
      await expect(h.declare()).rejects.toThrow('Dean approval is required');
      const approvalRead = h.manager.query.mock.calls.find(([sql]) =>
        sql.includes('ORDER BY requested_at'),
      )!;
      expect(approvalRead[0]).not.toContain("status = 'APPROVED'");
      expect(h.writes()).toHaveLength(0);
    },
  );

  it.each(['RESULT_COE_AUDIT_ANOMALY', 'RESULT_INPUTS_CHANGED'])(
    'rejects latest COE state %s despite an older passing audit',
    async (action) => {
      const h = setup();
      h.seedApproval();
      h.state.audits.push({
        action,
        new_value: { result_state: h.currentState() },
      });
      await expect(h.declare()).rejects.toThrow('passing COE formula audit');
      expect(h.writes()).toHaveLength(0);
    },
  );

  it('rejects a COE audit that does not match the current input fingerprint', async () => {
    const h = setup();
    h.state.marks[0].marks_obtained = 82;
    h.seedApproval();
    await expect(h.declare()).rejects.toThrow('passing COE formula audit');
    expect(h.writes()).toHaveLength(0);
  });

  it.each([
    { entry_status: 'OPEN', marks_locked: false },
    { exam_type: 'WT1' },
    { exam_type: 'WT2' },
  ])('rejects unsupported review state %j', async (changes) => {
    const h = setup();
    Object.assign(h.state.session, changes);
    h.refreshCoe();
    h.seedApproval();
    await expect(h.request()).rejects.toBeInstanceOf(BadRequestException);
    await expect(h.declare()).rejects.toBeInstanceOf(BadRequestException);
    expect(h.writes()).toHaveLength(0);
  });

  it('stores a fingerprinted COE audit using the same transaction', async () => {
    const h = setup();
    h.state.audits = [];
    await expect(
      h.service.runFormulaAudit(tenantId, sessionId, examActor),
    ).resolves.toMatchObject({ status: 'passed' });
    expect(h.audit.log).toHaveBeenCalledWith(
      tenantId,
      examActor,
      expect.objectContaining({
        action: 'RESULT_COE_AUDIT_PASSED',
        new_value: expect.objectContaining({ result_state: h.currentState() }),
      }),
      h.manager,
    );
  });

  it('makes repeated current requests idempotent and notifies only after commit', async () => {
    const h = setup();
    const first = await h.request();
    const second = await h.request();
    expect(second.request_id).toBe(first.request_id);
    expect(h.state.requests).toHaveLength(1);
    expect(h.notify.approvalRequired).toHaveBeenCalledTimes(1);
    expect(h.events.indexOf('commit')).toBeLessThan(
      h.events.indexOf('notify:dean'),
    );
  });

  it('handles PostgreSQL zero-row invalidation without inserting undefined history IDs', async () => {
    const h = setup();
    await expect(h.request()).resolves.toMatchObject({ status: 'PENDING' });
    const invalidationIndex = h.manager.query.mock.calls.findIndex(([sql]) =>
      sql.includes('invalidated_at'),
    );
    expect(invalidationIndex).toBeGreaterThanOrEqual(0);
    await expect(
      h.manager.query.mock.results[invalidationIndex].value,
    ).resolves.toEqual([[], 0]);
    expect(h.state.history).toHaveLength(1);
    expect(h.state.history[0][5]).toBe('REQUESTED');
    expect(h.state.history[0][0]).toBe(h.state.requests[0].request_id);
    expect(
      h.state.audits.some(
        (event) => event.action === 'RESULT_APPROVALS_INVALIDATED',
      ),
    ).toBe(false);
  });

  it('does not notify Dean if required approval audit fails and rolls back', async () => {
    const h = setup({ failAudit: 'RESULT_DEAN_APPROVAL_REQUESTED' });
    await expect(h.request()).rejects.toThrow('audit write failed');
    expect(h.state.requests).toHaveLength(0);
    expect(h.state.history).toHaveLength(0);
    expect(h.notify.approvalRequired).not.toHaveBeenCalled();
  });

  it('rejects unauthorized decision roles before reading or changing the request', async () => {
    const h = setup();
    const approval = h.seedApproval('PENDING');
    await expect(
      h.decide(approval.request_id, 'APPROVED', 'Faculty'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.db.transaction).not.toHaveBeenCalled();
  });

  it('rejects invalid decision values instead of recording a false approval', async () => {
    const h = setup();
    const approval = h.seedApproval('PENDING');
    await expect(
      h.decide(approval.request_id, 'INVALID' as 'APPROVED'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(h.db.transaction).not.toHaveBeenCalled();
  });

  it('does not approve a stale pending request after marks change', async () => {
    const h = setup();
    const approval = h.seedApproval('PENDING');
    h.state.marks[0].marks_obtained = 83;
    h.refreshCoe();
    await expect(h.decide(approval.request_id)).rejects.toThrow(
      'Dean approval is stale',
    );
    expect(h.state.requests[0].status).toBe('PENDING');
    expect(h.state.history).toHaveLength(0);
  });

  it('rejects PostgreSQL [[], 0] decision compare-and-set before recording an event', async () => {
    const h = setup({ failDecisionCas: true });
    const approval = h.seedApproval('PENDING');
    await expect(h.decide(approval.request_id)).rejects.toThrow(
      'already decided',
    );
    const update = h.manager.query.mock.calls.find(([sql]) =>
      sql.includes('decided_by = $4'),
    )!;
    expect(update[0]).toContain("AND status = 'PENDING'");
    expect(update[0]).toContain('RETURNING request_id');
    expect(h.state.history).toHaveLength(0);
    expect(h.state.requests[0].status).toBe('PENDING');
    expect(h.events).toContain('rollback');
    expect(
      h.state.audits.some((event) => event.action === 'RESULT_DEAN_APPROVED'),
    ).toBe(false);
  });

  it('allows one competing decision in serialized mock transactions (not a DB concurrency test)', async () => {
    const h = setup();
    const approval = h.seedApproval('PENDING');
    const decisions = await Promise.allSettled([
      h.decide(approval.request_id, 'APPROVED'),
      h.decide(approval.request_id, 'REJECTED'),
    ]);
    expect(
      decisions.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      decisions.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    expect(h.state.history).toHaveLength(1);
  });

  it('uses scoped manager locks in advisory, session, policy, marks, enrollment order', async () => {
    const h = setup();
    h.state.session.grading_policy_id = 1;
    h.refreshCoe();
    h.seedApproval();
    await h.declare();
    const sql = h.manager.query.mock.calls.map(([query]) => query);
    const advisory = sql.findIndex((query) =>
      query.includes('pg_advisory_xact_lock'),
    );
    const session = sql.findIndex((query) => query.includes('FOR UPDATE OF s'));
    const policy = sql.findIndex(
      (query) =>
        query.includes('academic_grading_policies') &&
        query.includes('FOR SHARE'),
    );
    const marks = sql.findIndex((query) =>
      query.includes('FROM academic_marks'),
    );
    const roster = sql.findIndex((query) =>
      query.includes('FROM student_course_enrollments'),
    );
    expect(advisory).toBeGreaterThanOrEqual(0);
    expect(session).toBeGreaterThan(advisory);
    expect(policy).toBeGreaterThan(session);
    expect(marks).toBeGreaterThan(policy);
    expect(roster).toBeGreaterThan(marks);
    expect(sql[roster]).toContain('FOR UPDATE');
    expect(sql[roster]).toContain('ORDER BY enrollment_id');
    expect(sql[roster]).toContain('tenant_id = $1');
    expect(sql[roster]).toContain('course_id = $2');
    expect(sql[roster]).toContain('semester = $3');
    expect(sql[roster]).toContain('student_user_id = ANY($4::uuid[])');
    expect(sql[roster]).toContain('deleted_at IS NULL');
    expect(h.manager.query.mock.calls[roster][1]).toEqual([
      tenantId,
      courseId,
      4,
      ['student-a'],
    ]);
    expect(sql[marks]).toContain('FOR UPDATE');
    expect(h.manager.query.mock.calls[marks][1]).toEqual([
      tenantId,
      courseId,
      'END_TERM',
    ]);
    expect(h.db.query).not.toHaveBeenCalled();
    expect(h.events.indexOf('commit')).toBeLessThan(
      h.events.indexOf('notify:student'),
    );
  });

  it('does not duplicate reports, notification, or successful audit on repeated declaration', async () => {
    const h = setup();
    h.seedApproval();
    await h.declare();
    await expect(h.declare()).rejects.toThrow('already declared');
    expect(h.state.reports).toHaveLength(1);
    expect(h.notify.examResultsPublished).toHaveBeenCalledTimes(1);
    expect(
      h.state.audits.filter((event) => event.action === 'RESULT_DECLARED'),
    ).toHaveLength(1);
  });

  it('rolls back publication when declaration compare-and-set returns PostgreSQL [[], 0]', async () => {
    const h = setup({ failDeclarationCas: true });
    h.seedApproval();
    await expect(h.declare()).rejects.toThrow('already declared');
    expect(
      h.manager.query.mock.calls.some(([sql]) =>
        sql.includes('INSERT INTO student_exam_reports'),
      ),
    ).toBe(true);
    expect(h.state.reports).toHaveLength(0);
    expect(h.state.marks[0].status).toBe('PENDING_COE');
    expect(h.state.session.declared_at).toBeNull();
    expect(h.state.requests[0].status).toBe('APPROVED');
    expect(h.events).toContain('rollback');
    expect(h.events).not.toContain('commit');
    expect(h.notify.examResultsPublished).not.toHaveBeenCalled();
    expect(
      h.state.audits.some((event) => event.action === 'RESULT_DECLARED'),
    ).toBe(false);
    expect(
      h.state.audits.some(
        (event) => event.action === 'RESULT_DECLARATION_FAILED',
      ),
    ).toBe(true);
  });

  it('rejects another authenticated tenant before acquiring a result lock', async () => {
    const h = setup();
    h.seedApproval();
    await expect(
      h.service.declareSession('tenant-b', sessionId, examActor, {}),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(
      h.manager.query.mock.calls.some(([sql]) =>
        sql.includes('pg_advisory_xact_lock'),
      ),
    ).toBe(false);
    expect(h.writes()).toHaveLength(0);
  });

  const edits: Array<
    [string, (h: ReturnType<typeof setup>) => Promise<unknown>]
  > = [
    [
      'rules',
      (h) =>
        h.service.configureRules(
          tenantId,
          sessionId,
          { pass_marks: 45 },
          examActor,
        ),
    ],
    [
      'reopen',
      (h) =>
        h.service.reopenEntry(
          tenantId,
          sessionId,
          { reason: 'Correct a mark' },
          examActor,
        ),
    ],
    [
      'grace',
      (h) =>
        h.service.applySessionGraceMarks(tenantId, sessionId, examActor, 1),
    ],
    [
      'upsert',
      (h) =>
        h.service.createSession(
          tenantId,
          {
            course_id: courseId,
            exam_type: 'END_TERM',
            semester: 4,
            max_marks: 95,
          },
          examActor,
        ),
    ],
  ];
  function stubAfterEditReads(h: ReturnType<typeof setup>) {
    jest
      .spyOn(h.service, 'getSession')
      .mockImplementation(async () => clone(h.state.session));
    jest
      .spyOn(h.service, 'processSession')
      .mockResolvedValue({ preview: [] } as never);
  }
  it.each(edits)(
    'invalidates existing approvals transactionally when %s changes',
    async (_label, edit) => {
      const h = setup();
      h.seedApproval();
      stubAfterEditReads(h);
      await edit(h);
      expect(h.state.requests[0].status).toBe('REJECTED');
      expect(h.state.history.some((row) => row[5] === 'INVALIDATED')).toBe(
        true,
      );
      const invalidationIndex = h.manager.query.mock.calls.findIndex(([sql]) =>
        sql.includes('invalidated_at'),
      );
      await expect(
        h.manager.query.mock.results[invalidationIndex].value,
      ).resolves.toEqual([[{ request_id: h.state.requests[0].request_id }], 1]);
      expect(
        h.state.history
          .filter((row) => row[5] === 'INVALIDATED')
          .map((row) => row[0]),
      ).toEqual([h.state.requests[0].request_id]);
      expect(h.audit.log).toHaveBeenCalledWith(
        tenantId,
        examActor,
        expect.objectContaining({ action: 'RESULT_APPROVALS_INVALIDATED' }),
        h.manager,
      );
      expect(h.db.transaction).toHaveBeenCalledTimes(1);
      await expect(h.declare()).rejects.toBeInstanceOf(BadRequestException);
      expect(h.notify.examResultsPublished).not.toHaveBeenCalled();
    },
  );

  it.each(edits)(
    'does not allow %s changes after declaration',
    async (_label, edit) => {
      const h = setup();
      h.seedApproval();
      h.state.session.declared_at = '2026-10-21T09:00:00Z';
      stubAfterEditReads(h);
      await expect(edit(h)).rejects.toThrow('already declared');
      expect(h.state.requests[0].status).toBe('APPROVED');
      expect(h.writes()).toHaveLength(0);
    },
  );

  it.each(edits)(
    'rolls back %s changes and invalidation if required audit fails',
    async (_label, edit) => {
      const h = setup({ failAudit: 'RESULT_APPROVALS_INVALIDATED' });
      h.seedApproval();
      stubAfterEditReads(h);
      const before = clone(h.state);
      await expect(edit(h)).rejects.toThrow('audit write failed');
      expect(h.state).toEqual(before);
      expect(h.events).toContain('rollback');
      expect(h.notify.examResultsPublished).not.toHaveBeenCalled();
    },
  );
});
