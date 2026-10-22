import { ExamCellService } from './exam-cell.service';

describe('Course grade aggregate retake semester scope', () => {
  const retakes = [
    { semester: 4, marks_obtained: 30 },
    { semester: 6, marks_obtained: 48 },
  ];

  it.each([
    { semester: 4, expectedEndTerm: 30, expectedAggregate: 36 },
    { semester: 6, expectedEndTerm: 48, expectedAggregate: 54 },
    { semester: 3, expectedEndTerm: 10, expectedAggregate: 16 },
  ])(
    'uses only the requested semester $semester and preserves the original when none is selected',
    async ({ semester, expectedEndTerm, expectedAggregate }) => {
      const query = jest.fn((sql: string, params: unknown[]) => {
        if (sql.includes('SELECT e.student_user_id'))
          return Promise.resolve([
            {
              student_user_id: 'student',
              student_name: 'Synthetic repeat student',
            },
          ]);
        const selected = retakes.filter(
          (row) =>
            !sql.includes('retake.semester=$3') || row.semester === params[2],
        );
        return Promise.resolve([
          { student_user_id: 'student', exam_type: 'QUIZ', marks_obtained: 1 },
          {
            student_user_id: 'student',
            exam_type: 'INTERNAL',
            marks_obtained: 2,
          },
          { student_user_id: 'student', exam_type: 'CAT1', marks_obtained: 3 },
          ...(selected.length ? selected : [{ marks_obtained: 10 }]).map(
            (row: { marks_obtained: number }) => ({
              student_user_id: 'student',
              exam_type: 'END_TERM',
              marks_obtained: row.marks_obtained,
            }),
          ),
        ]);
      });
      const service = new ExamCellService(
        { query } as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );
      await expect(
        service.getGradesAggregateTable('tenant', semester, 'course'),
      ).resolves.toEqual([
        expect.objectContaining({
          student_id: 'student',
          end_term_marks: expectedEndTerm,
          aggregate: expectedAggregate,
        }),
      ]);
      expect(query).toHaveBeenLastCalledWith(
        expect.stringContaining('retake.semester=$3'),
        ['tenant', 'course', semester],
      );
      expect(query.mock.calls[1][0]).toContain('retake.tenant_id=m.tenant_id');
      expect(query.mock.calls[1][0]).toContain(
        'retake.source_exam_type=m.exam_type',
      );
    },
  );
});
