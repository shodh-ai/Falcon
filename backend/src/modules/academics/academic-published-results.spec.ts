import { ForbiddenException } from '@nestjs/common';
import { AcademicsService } from './academics.service';

jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-id') }));

describe('Student examination result visibility', () => {
  it('uses tenant and published status while resolving only unambiguous enrolled subjects', async () => {
    const query = jest
      .fn<Promise<Array<{ subject_id: number }>>, [string, unknown[]]>()
      .mockResolvedValue([{ subject_id: 363 }]);
    const service = {
      results: { manager: { query } },
    } as unknown as AcademicsService;
    await expect(
      AcademicsService.prototype.listResultsForStudent.call(
        service,
        'student',
        'tenant',
      ),
    ).resolves.toEqual([{ subject_id: 363 }]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("r.tenant_id = $2 AND r.status = 'PUBLISHED'"),
      ['student', 'tenant'],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('HAVING COUNT(DISTINCT sub.subject_id) = 1'),
      ['student', 'tenant'],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('e.semester = sub.semester'),
      ['student', 'tenant'],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'MIN(sub.subject_name) AS subject_name, MIN(sub.subject_code) AS subject_code',
      ),
      ['student', 'tenant'],
    );
    const sql = query.mock.calls
      .map(([statement]) => String(statement))
      .find((statement) => statement.includes('FROM academic_exam_results r'))!;
    expect(sql).toContain('br.source_result_id = r.result_id');
    expect(sql).toContain('br.tenant_id = r.tenant_id');
    expect(sql).toContain('br.student_user_id = r.student_user_id');
    expect(sql).toContain('br.selected_attempt_id IS NOT NULL');
    expect(sql).toContain(
      'COALESCE(br.marks_obtained, r.marks_obtained) AS marks_obtained',
    );
    expect(sql).toContain('COALESCE(br.grade, r.grade) AS grade');
    expect(sql).toContain(
      'COALESCE(br.grade_points, r.grade_points) AS grade_points',
    );
  });

  it('requires tenant context before querying results', () => {
    const query = jest.fn();
    const service = {
      results: { manager: { query } },
    } as unknown as AcademicsService;
    expect(() => {
      AcademicsService.prototype.listResultsForStudent.call(service, 'student');
    }).toThrow(ForbiddenException);
    expect(query).not.toHaveBeenCalled();
  });
});
