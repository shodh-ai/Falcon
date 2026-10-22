import { StudentPortalService } from './student-portal.service';
type MarksResponse = {
  component_marks: Array<{ retake_attempt_id: string }>;
  sgpa_history: Array<{ semester: number; sgpa: number }>;
  cgpa: number;
};

jest.mock('uuid', () => ({ v4: jest.fn() }));

describe('Student current published marks', () => {
  it('uses tenant-scoped published retakes and includes failed attempted credits in GPA', async () => {
    const query = jest
      .fn<Promise<Array<Record<string, unknown>>>, [string, unknown[]]>()
      .mockResolvedValueOnce([{ has_open_ufm: false }])
      .mockResolvedValueOnce([
        { marks_obtained: '70', retake_attempt_id: 'retake' },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          semester: 4,
          status: 'COMPLETED',
          grade_points: '8',
          credits: '3',
          course_code: 'SYNTH-A',
        },
        {
          semester: 4,
          status: 'FAILED',
          grade_points: '0',
          credits: '3',
          course_code: 'SYNTH-B',
        },
      ]);
    const result = (await StudentPortalService.prototype.getMarks.call(
      { dataSource: { query } },
      'tenant',
      'student',
    )) as MarksResponse;
    expect(result.component_marks[0].retake_attempt_id).toBe('retake');
    expect(result.sgpa_history).toEqual([{ semester: 4, sgpa: 4 }]);
    expect(result.cgpa).toBe(4);
    const sql = query.mock.calls.map(([statement]) => statement);
    expect(sql[1]).toContain('exam_backlog_current_results');
    expect(sql[1]).toContain('retake.tenant_id=m.tenant_id');
    expect(sql[1]).toContain("m.status = 'PUBLISHED'");
    expect(sql[2]).toContain("status = 'PUBLISHED'");
    expect(sql[3]).toContain('e.tenant_id = $2');
    expect(query.mock.calls[3][1]).toEqual(['student', 'tenant']);
  });

  it('shows the actual published semester GPA instead of the cumulative GPA', async () => {
    const query = jest
      .fn<Promise<Array<Record<string, unknown>>>, [string, unknown[]]>()
      .mockResolvedValueOnce([{ has_open_ufm: false }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ semester: 4, cgpa: '7', payload: { sgpa: 8 } }])
      .mockResolvedValueOnce([]);
    const result = (await StudentPortalService.prototype.getMarks.call(
      { dataSource: { query } },
      'tenant',
      'student',
    )) as MarksResponse;
    expect(result.sgpa_history).toEqual([{ semester: 4, sgpa: 8 }]);
  });

  it('propagates a database failure instead of inventing an empty marks list', async () => {
    const query = jest
      .fn<Promise<Array<Record<string, unknown>>>, [string, unknown[]]>()
      .mockRejectedValue(new Error('database unavailable'));
    await expect(
      StudentPortalService.prototype.getMarks.call(
        { dataSource: { query } },
        'tenant',
        'student',
      ),
    ).rejects.toThrow('database unavailable');
    expect(query).toHaveBeenCalledTimes(1);
  });
});
