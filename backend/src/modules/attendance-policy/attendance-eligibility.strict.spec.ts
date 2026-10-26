import { BadRequestException } from '@nestjs/common';
import {
  AttendanceEligibilityService,
  type AttendanceEligibilityOptions,
} from './attendance-eligibility.service';

const TENANT = 'a1000000-0000-4000-8000-000000000001';
const STUDENT = 'a1000000-0000-4000-8000-000000000002';
const COURSE_A = 'a1000000-0000-4000-8000-000000000003';
const COURSE_B = 'a1000000-0000-4000-8000-000000000004';
const EXEMPTION = 'a1000000-0000-4000-8000-000000000005';

type Enrollment = {
  course_id: string;
  attendance_percent: number | string | null;
  course_code: string;
  min_attendance: number | null;
};

const enrollment = (changes: Partial<Enrollment> = {}): Enrollment => ({
  course_id: COURSE_A,
  attendance_percent: 82,
  course_code: 'EXAM-A',
  min_attendance: null,
  ...changes,
});

function harness(
  input: {
    students?: Array<{ dept_id: number | null }>;
    enrollments?: Enrollment[];
    threshold?: number;
    exemption?: string;
    failure?: string;
  } = {},
) {
  const error = new Error('Authoritative attendance dependency unavailable');
  const query = jest
    .fn<Promise<unknown[]>, [string, unknown[]?]>()
    .mockImplementation(async (sql) => {
      if (input.failure && sql.includes(input.failure)) throw error;
      if (sql.includes('SELECT u.dept_id'))
        return input.students ?? [{ dept_id: 17 }];
      if (sql.includes('SELECT e.course_id'))
        return input.enrollments ?? [enrollment()];
      if (sql.includes('FROM attendance_threshold_requests')) {
        return input.threshold == null
          ? []
          : [{ requested_min_percent: input.threshold }];
      }
      if (sql.includes('FROM student_attendance_exemptions')) {
        return input.exemption ? [{ exemption_id: input.exemption }] : [];
      }
      if (sql.includes('INSERT INTO attendance_eligibility_audit')) return [];
      throw new Error(`Unexpected test query: ${sql}`);
    });
  const service = new AttendanceEligibilityService({ query } as never);
  const options: AttendanceEligibilityOptions = {
    strict: true,
    semester: 4,
    courseIds: [COURSE_A],
    context: 'ADMIT_CARD',
  };
  return { service, options, query, error };
}

describe('strict Exam Cell attendance integration (mocked source tests)', () => {
  it('accepts complete tenant/course/semester attendance using the existing default policy', async () => {
    const { service, options, query } = harness();
    await expect(service.evaluate(TENANT, STUDENT, options)).resolves.toEqual({
      attendance_percent: 82,
      effective_threshold: 75,
      threshold_source: 'DEFAULT',
      exemption_id: null,
      eligible: true,
      reason: null,
    });
    const [identitySql, identityParameters] = query.mock.calls[0];
    expect(identitySql).toContain('u.tenant_id = $2');
    expect(identitySql).toContain(
      'u.is_active = true AND u.deleted_at IS NULL',
    );
    expect(identitySql).toContain("r.role_name = 'Student'");
    expect(identitySql).toContain('ur.deleted_at IS NULL');
    expect(identityParameters).toEqual([STUDENT, TENANT]);
    const [enrollmentSql, enrollmentParameters] = query.mock.calls[1];
    expect(enrollmentSql).toContain(
      'c.tenant_id = $1 AND c.deleted_at IS NULL',
    );
    expect(enrollmentSql).toContain(
      'e.tenant_id = $1 AND e.student_user_id = $2',
    );
    expect(enrollmentSql).toContain('e.semester = $3');
    expect(enrollmentSql).toContain('e.course_id = ANY($4::uuid[])');
    expect(enrollmentSql).toContain(
      "e.status = 'ENROLLED' AND e.deleted_at IS NULL",
    );
    expect(enrollmentParameters).toEqual([TENANT, STUDENT, 4, [COURSE_A]]);
  });

  it('uses the verified department policy instead of a caller-supplied department', async () => {
    const { service, options, query } = harness({
      threshold: 70,
      enrollments: [enrollment({ attendance_percent: 72 })],
    });
    const result = await service.evaluate(TENANT, STUDENT, {
      ...options,
      deptId: 999,
    });
    expect(result.eligible).toBe(true);
    expect(result.effective_threshold).toBe(70);
    expect(result.threshold_source).toBe('POLICY');
    expect(
      query.mock.calls.find(([sql]) =>
        sql.includes('FROM attendance_threshold_requests'),
      )?.[1],
    ).toEqual([TENANT, 17]);
  });

  it('preserves per-course minimums and explains shortfalls', async () => {
    const { service, options } = harness({
      threshold: 70,
      enrollments: [enrollment({ attendance_percent: 82, min_attendance: 90 })],
    });
    const result = await service.evaluate(TENANT, STUDENT, options);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('Blocked: Shortfall in EXAM-A (82% < 90%)');
  });

  it('honours approved exemptions for the same semester or an unscoped global exemption', async () => {
    const { service, options, query } = harness({
      enrollments: [enrollment({ attendance_percent: 40 })],
      exemption: EXEMPTION,
    });
    const result = await service.evaluate(TENANT, STUDENT, options);
    expect(result.eligible).toBe(true);
    expect(result.threshold_source).toBe('EXEMPTION');
    expect(result.exemption_id).toBe(EXEMPTION);
    const [sql, parameters] = query.mock.calls.find(([sql]) =>
      sql.includes('FROM student_attendance_exemptions'),
    )!;
    expect(sql).toContain(
      "tenant_id = $1 AND student_user_id = $2 AND status = 'APPROVED'",
    );
    expect(sql).toContain('AND (semester IS NULL OR semester = $3)');
    expect(parameters).toEqual([TENANT, STUDENT, 4]);
  });

  it('rejects an inactive, deleted, non-student or other-tenant identity without reading their enrollment', async () => {
    const { service, options, query } = harness({ students: [] });
    const result = await service.evaluate(TENANT, STUDENT, options);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain(
      'Active student record is unavailable in this tenant',
    );
    expect(query).toHaveBeenCalledTimes(1);
  });

  it.each([
    { enrollments: [] },
    { enrollments: [enrollment({ course_id: COURSE_B })] },
    { enrollments: [enrollment(), enrollment()] },
  ])(
    'rejects missing, wrong-scope or duplicate enrollment rows: %p',
    async ({ enrollments }) => {
      const { service, options, query } = harness({
        enrollments,
        exemption: EXEMPTION,
      });
      const result = await service.evaluate(TENANT, STUDENT, options);
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain(
        'Active enrollment is missing or inconsistent',
      );
      expect(result.exemption_id).toBeNull();
      expect(
        query.mock.calls.some(([sql]) =>
          sql.includes('FROM student_attendance_exemptions'),
        ),
      ).toBe(false);
    },
  );

  it('requires every requested course even if the available course is eligible', async () => {
    const { service, options } = harness();
    const result = await service.evaluate(TENANT, STUDENT, {
      ...options,
      courseIds: [COURSE_A, COURSE_B],
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain(
      'Active enrollment is missing or inconsistent',
    );
  });

  it.each([null, 'invalid', -1, 101])(
    'blocks unavailable or invalid attendance %p without allowing an exemption to invent data',
    async (attendance_percent) => {
      const { service, options, query } = harness({
        enrollments: [enrollment({ attendance_percent })],
        exemption: EXEMPTION,
      });
      const result = await service.evaluate(TENANT, STUDENT, options);
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain(
        'Attendance data is unavailable or invalid for EXAM-A',
      );
      expect(result.exemption_id).toBeNull();
      expect(
        query.mock.calls.some(([sql]) =>
          sql.includes('FROM student_attendance_exemptions'),
        ),
      ).toBe(false);
    },
  );

  it.each([
    'SELECT u.dept_id',
    'SELECT e.course_id',
    'FROM attendance_threshold_requests',
    'FROM student_attendance_exemptions',
  ])('propagates an unavailable authoritative source: %s', async (failure) => {
    const { service, options, error } = harness({
      failure,
      enrollments: [enrollment({ attendance_percent: 40 })],
    });
    await expect(service.evaluate(TENANT, STUDENT, options)).rejects.toBe(
      error,
    );
  });

  it('does not turn a required eligibility audit failure into success', async () => {
    const { service, options, error } = harness({
      failure: 'INSERT INTO attendance_eligibility_audit',
    });
    await expect(
      service.evaluate(TENANT, STUDENT, { ...options, audit: true }),
    ).rejects.toBe(error);
  });

  it('uses the supplied transaction manager for every source read and required audit', async () => {
    const { options, query } = harness({
      enrollments: [enrollment({ attendance_percent: 40 })],
    });
    const globalQuery = jest.fn();
    const service = new AttendanceEligibilityService({
      query: globalQuery,
    } as never);
    const result = await service.evaluate(TENANT, STUDENT, {
      ...options,
      audit: true,
      manager: { query } as never,
    });
    expect(result.eligible).toBe(false);
    expect(globalQuery).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(5);
    const audit = query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO attendance_eligibility_audit'),
    );
    expect(audit?.[1]).toEqual([
      TENANT,
      STUDENT,
      40,
      75,
      'DEFAULT',
      null,
      false,
      'Blocked: Shortfall in EXAM-A (40% < 75%)',
      'ADMIT_CARD',
    ]);
  });

  it.each([
    { tenant: '', student: STUDENT },
    { tenant: TENANT, student: 'not-a-student-id' },
    { semester: 0 },
    { semester: 1.5 },
    { semester: undefined },
    { courseIds: [] },
    { courseIds: [COURSE_A, COURSE_A] },
    { courseIds: [COURSE_A, COURSE_A.toUpperCase()] },
    { courseIds: ['invalid-course'] },
  ])(
    'rejects invalid strict scope %p before reading sources',
    async (change) => {
      const { service, options, query } = harness();
      const {
        tenant = TENANT,
        student = STUDENT,
        ...optionChanges
      } = change as AttendanceEligibilityOptions & {
        tenant?: string;
        student?: string;
      };
      await expect(
        service.evaluate(tenant, student, { ...options, ...optionChanges }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(query).not.toHaveBeenCalled();
    },
  );

  it('normalizes UUID case for complete enrollment comparison', async () => {
    const { service, options } = harness();
    await expect(
      service.evaluate(TENANT, STUDENT, {
        ...options,
        courseIds: [COURSE_A.toUpperCase()],
      }),
    ).resolves.toMatchObject({ eligible: true });
  });

  it('keeps legacy callers unchanged unless strict mode is explicitly requested', async () => {
    const query = jest
      .fn<Promise<unknown[]>, [string, unknown[]?]>()
      .mockImplementation(async (sql) => {
        if (sql.includes('SELECT dept_id FROM users')) return [{ dept_id: 17 }];
        if (sql.includes('AVG(attendance_percent)')) return [{ pct: 82 }];
        if (sql.includes('FROM attendance_threshold_requests'))
          throw new Error('Legacy missing policy table');
        if (sql.includes('SELECT e.attendance_percent'))
          return [
            {
              attendance_percent: 82,
              course_code: 'EXAM-A',
              min_attendance: null,
            },
          ];
        if (sql.includes('INSERT INTO attendance_eligibility_audit'))
          throw new Error('Legacy optional audit unavailable');
        throw new Error(`Unexpected legacy query: ${sql}`);
      });
    const service = new AttendanceEligibilityService({ query } as never);
    await expect(
      service.evaluate('legacy-tenant', 'legacy-student', { audit: true }),
    ).resolves.toMatchObject({
      eligible: true,
      attendance_percent: 82,
      effective_threshold: 75,
      threshold_source: 'DEFAULT',
    });
    expect(
      query.mock.calls.some(([sql]) => sql.includes('SELECT u.dept_id')),
    ).toBe(false);
  });
});
