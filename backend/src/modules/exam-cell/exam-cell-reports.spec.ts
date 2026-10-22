import { ExamCellOperationsService } from './exam-cell-operations.service';
import { ExamCellService } from './exam-cell.service';
import { ExamCellEnterpriseService } from './exam-cell-enterprise.service';

describe('Persisted result reporting', () => {
  it('includes declared outcomes in the dashboard count and chart', async () => {
    const query = jest.fn((sql: string) => {
      if (sql.includes('student_exam_reports')) {
        if (sql.includes('ser.status')) {
          return Promise.reject(new Error('column ser.status does not exist'));
        }
        return Promise.resolve(
          sql.includes('AS label') ? [{ label: 'PASS', count: 1 }] : [{ c: 1 }],
        );
      }
      return Promise.resolve([{ c: 0 }]);
    });
    const service = new ExamCellService(
      { query } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(service.dashboard('tenant')).resolves.toMatchObject({
      published_results: 1,
      result_status_chart: [{ label: 'PASS', count: 1 }],
    });
  });

  it('reports published PASS outcomes from the result_status schema field', async () => {
    const query = jest.fn((sql: string) => {
      if (sql.includes('FROM student_exam_reports')) {
        if (sql.includes('ser.status')) {
          return Promise.reject(new Error('column ser.status does not exist'));
        }
        return Promise.resolve([{ label: 'PASS', count: 1 }]);
      }
      return Promise.resolve([]);
    });
    const service = new ExamCellOperationsService(
      { query } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(service.getReportsSummary('tenant', 6)).resolves.toMatchObject(
      {
        semester: 6,
        pass_fail: [{ label: 'PASS', count: 1 }],
        pass_percentage: 100,
      },
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('ser.result_status'),
      ['tenant', 6],
    );
  });
});

describe('Current grade-card report source', () => {
  it('loads rankers only from the actual published grade-card payload', async () => {
    const query = jest.fn((sql: string) =>
      Promise.resolve(
        sql.includes('FROM grade_cards gc')
          ? [
              {
                name: 'Synthetic',
                enrollment_number: 'SYNTH-001',
                cgpa: '10',
                sgpa: '10',
              },
            ]
          : [],
      ),
    );
    const service = new ExamCellOperationsService(
      { query } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const report = await service.getReportsSummary('tenant', 9);
    expect(report.top_rankers).toEqual([
      {
        name: 'Synthetic',
        enrollment_number: 'SYNTH-001',
        cgpa: '10',
        sgpa: '10',
      },
    ]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("gc.status = 'PUBLISHED'"),
      ['tenant', 9],
    );
    expect(
      query.mock.calls.some(([sql]) =>
        sql.includes('FROM student_grade_cards'),
      ),
    ).toBe(false);
  });
});

describe('Advanced examination analytics', () => {
  it('uses actual published result, course, uploader and report fields', async () => {
    const query = jest.fn((sql: string, params: unknown[]) => {
      expect(params).toEqual(['tenant', 8]);
      if (
        sql.includes('c.subject_id') ||
        sql.includes('am.submitted_by') ||
        sql.includes('ser.status')
      ) {
        return Promise.reject(new Error('column does not exist'));
      }
      if (sql.includes('AS avg_marks')) {
        return Promise.resolve([
          {
            subject_code: 'SYNTH',
            subject_name: 'Synthetic',
            avg_marks: '47',
            students: 1,
          },
        ]);
      }
      if (sql.includes('AS submissions')) {
        return Promise.resolve([{ name: 'Synthetic faculty', submissions: 1 }]);
      }
      if (sql.includes('FROM student_exam_reports ser')) {
        return Promise.resolve([{ label: 'PASS', count: 1 }]);
      }
      return Promise.resolve([{ grade: 'A+', count: 1 }]);
    });
    const service = new ExamCellEnterpriseService(
      { query } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.advancedAnalytics('tenant', 8)).resolves.toMatchObject(
      {
        grade_distribution: [{ grade: 'A+', count: 1 }],
        subject_analysis: [{ avg_marks: '47', students: 1 }],
        faculty_performance: [{ name: 'Synthetic faculty', submissions: 1 }],
        pass_fail: [{ label: 'PASS', count: 1 }],
      },
    );
    const resultQueries = query.mock.calls
      .map(([sql]) => sql)
      .filter((sql) => sql.includes('FROM academic_exam_results r'));
    expect(resultQueries).toHaveLength(2);
    for (const sql of resultQueries) {
      expect(sql).toContain("r.status = 'PUBLISHED'");
      expect(sql).toContain('c.tenant_id = r.tenant_id');
      expect(sql).toContain('sub.subject_code = c.course_code');
      expect(sql).toContain('e.tenant_id = r.tenant_id');
      expect(sql).toContain('e.course_id = r.course_id');
      expect(sql).toContain('e.semester = $2');
      expect(sql).toContain('AND EXISTS');
      expect(sql).toContain('br.source_result_id = r.result_id');
      expect(sql).toContain('br.tenant_id = r.tenant_id');
      expect(sql).toContain('br.student_user_id = r.student_user_id');
      expect(sql).toContain(
        'br.semester = $2 AND br.selected_attempt_id IS NOT NULL',
      );
    }
    expect(query.mock.calls[2][0]).toContain('u.user_id = am.uploaded_by');
    expect(query.mock.calls[2][0]).toContain('u.tenant_id = am.tenant_id');
    const passFailSql = query.mock.calls[3][0];
    expect(passFailSql).toContain('ser.tenant_id = $1');
    expect(passFailSql).toContain(
      'COALESCE(br.result_status, ser.result_status) AS label',
    );
    expect(passFailSql).toContain('br.source_report_id = ser.report_id');
    expect(passFailSql).toContain('br.tenant_id = ser.tenant_id');
    expect(passFailSql).toContain('br.student_user_id = ser.student_user_id');
    expect(passFailSql).toContain(
      'br.semester = ers.semester AND br.selected_attempt_id IS NOT NULL',
    );
    expect(passFailSql).toContain('ers.declared_at IS NOT NULL');
    expect(query.mock.calls[0][0]).toContain(
      'COALESCE(br.grade, r.grade) AS grade',
    );
    expect(query.mock.calls[1][0]).toContain(
      'AVG(COALESCE(br.marks_obtained, r.marks_obtained))',
    );
  });

  it('propagates analytics query failures instead of returning empty charts', async () => {
    const query = jest.fn(() =>
      Promise.reject(new Error('database unavailable')),
    );
    const service = new ExamCellEnterpriseService(
      { query } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(service.advancedAnalytics('tenant', 8)).rejects.toThrow(
      'database unavailable',
    );
  });

  it('returns genuine empty data when all analytics queries succeed without rows', async () => {
    const service = new ExamCellEnterpriseService(
      { query: jest.fn(() => Promise.resolve([])) } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(service.advancedAnalytics('tenant', 9)).resolves.toEqual({
      semester: 9,
      grade_distribution: [],
      subject_analysis: [],
      faculty_performance: [],
      pass_fail: [],
    });
  });
});

describe('Current retake report reconciliation', () => {
  it.each(['dashboard', 'reports'] as const)(
    'uses the selected published retake without rewriting original outcomes in %s',
    async (projection) => {
      const query = jest.fn((sql: string) => {
        if (
          sql.includes('FROM student_exam_reports') &&
          sql.includes('AS label')
        ) {
          const current =
            sql.includes(
              'COALESCE(br.result_status, ser.result_status) AS label',
            ) && sql.includes('LEFT JOIN exam_backlog_current_results br');
          return Promise.resolve(
            current
              ? [
                  { label: 'PASS', count: 1 },
                  { label: 'FAIL', count: 1 },
                ]
              : [{ label: 'FAIL', count: 2 }],
          );
        }
        return Promise.resolve(sql.includes('COUNT(') ? [{ c: 0 }] : []);
      });
      if (projection === 'dashboard') {
        const service = new ExamCellService(
          { query } as never,
          {} as never,
          {} as never,
          {} as never,
          {} as never,
          {} as never,
        );
        await expect(service.dashboard('tenant')).resolves.toMatchObject({
          result_status_chart: [
            { label: 'PASS', count: 1 },
            { label: 'FAIL', count: 1 },
          ],
        });
      } else {
        const service = new ExamCellOperationsService(
          { query } as never,
          {} as never,
          {} as never,
          {} as never,
          {} as never,
        );
        await expect(
          service.getReportsSummary('tenant', 12),
        ).resolves.toMatchObject({
          pass_fail: [
            { label: 'PASS', count: 1 },
            { label: 'FAIL', count: 1 },
          ],
          pass_percentage: 50,
        });
      }
      const call = query.mock.calls.find(
        ([sql]) =>
          sql.includes('FROM student_exam_reports') && sql.includes('AS label'),
      );
      expect(call).toBeDefined();
      const sql = call![0];
      expect(sql).toContain('ers.tenant_id = ser.tenant_id');
      expect(sql).toContain('br.source_report_id = ser.report_id');
      expect(sql).toContain('br.tenant_id = ser.tenant_id');
      expect(sql).toContain('br.student_user_id = ser.student_user_id');
      expect(sql).toContain(
        'br.semester = ers.semester AND br.selected_attempt_id IS NOT NULL',
      );
      expect(sql).toContain('ers.declared_at IS NOT NULL');
      expect(sql).toContain(
        'GROUP BY COALESCE(br.result_status, ser.result_status)',
      );
      expect(
        query.mock.calls.every(
          ([statement]) => !/^\s*(UPDATE|DELETE|INSERT)\b/i.test(statement),
        ),
      ).toBe(true);
    },
  );
});
