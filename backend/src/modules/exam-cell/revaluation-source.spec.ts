import { BadRequestException } from '@nestjs/common';
import {
  listReEvaluationSources,
  resolveReEvaluationSource,
  type ReEvaluationSource,
} from './revaluation-source';
import { CreateExamApplicationDto } from '../exams/dto/create-exam-application.dto';
import { validate } from 'class-validator';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = (exam = 'END_TERM'): ReEvaluationSource => ({
  result_id:
    exam === 'END_TERM'
      ? '11111111-1111-4111-8111-111111111111'
      : '22222222-2222-4222-8222-222222222222',
  course_id: 'course',
  course_name: 'Synthetic course',
  exam_type: exam,
  semester: 4,
  max_marks: '50',
  marks_obtained: '42',
  mark_id: `${exam}-mark`,
  session_id: `${exam}-session`,
  pass_marks: '20',
  grading_policy_id: null,
  subject_id: 362,
  subject_name: 'Synthetic subject',
  subject_code: 'SYN-362',
});
function setup(
  reports: ReEvaluationSource[] = [source()],
  legacy: ReEvaluationSource[] = [],
) {
  const query = jest.fn((sql: string) =>
    Promise.resolve(
      sql.includes('SELECT ar.result_id, c.course_id') ? reports : legacy,
    ),
  );
  return { manager: { query } as never, query };
}

describe('Explicit published revaluation source', () => {
  it('lists only supported owned published examinations without acquiring publication locks', async () => {
    const invalid = { ...source('MID_TERM'), max_marks: '0' };
    const { manager, query } = setup([source(), invalid]);
    await expect(
      listReEvaluationSources(manager, 'tenant', 'student'),
    ).resolves.toEqual([
      expect.objectContaining({
        result_id: source().result_id,
        subject_id: 362,
        exam_type: 'END_TERM',
      }),
    ]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        "AND ar.exam_type = s.exam_type AND ar.status = 'PUBLISHED'",
      ),
      ['tenant', 'student', null],
    );
    expect(query.mock.calls.every(([sql]) => !sql.includes('FOR UPDATE'))).toBe(
      true,
    );
    expect(
      query.mock.calls.every(
        ([sql]) =>
          sql.includes('e.student_user_id = $2') &&
          sql.includes('e.semester = sub.semester') &&
          sql.includes('e.tenant_id = $1'),
      ),
    ).toBe(true);
  });

  it('selects and locks the exact requested result and session while another exam is published', async () => {
    const selected = source('MID_TERM');
    const { manager, query } = setup([source(), selected]);
    await expect(
      resolveReEvaluationSource(manager, 'tenant', {
        student_user_id: 'student',
        subject_id: 362,
        source_result_id: selected.result_id,
        source_session_id: selected.session_id,
      }),
    ).resolves.toEqual(selected);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('AND s.session_id IS NOT DISTINCT FROM $5::uuid'),
      ['tenant', 'student', 362, selected.result_id, selected.session_id],
    );
  });

  it('uses persisted mark identity during later reassessment/publication', async () => {
    const selected = source();
    const { manager, query } = setup();
    await resolveReEvaluationSource(manager, 'tenant', {
      student_user_id: 'student',
      subject_id: 362,
      source_result_id: selected.result_id,
      source_session_id: selected.session_id,
      source_mark_id: selected.mark_id,
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('AND m.mark_id = $6::uuid'),
      [
        'tenant',
        'student',
        362,
        selected.result_id,
        selected.session_id,
        selected.mark_id,
      ],
    );
  });

  it.each([
    {
      source_result_id: source().result_id,
      source_session_id: 'wrong-session',
    },
    { source_result_id: '33333333-3333-4333-8333-333333333333' },
    { source_result_id: source().result_id, source_mark_id: 'wrong-mark' },
    { source_session_id: source().session_id },
  ])(
    'rejects an unavailable or mismatched examination identity before writes: %j',
    async (selection) => {
      const { manager } = setup();
      await expect(
        resolveReEvaluationSource(manager, 'tenant', {
          student_user_id: 'student',
          subject_id: 362,
          ...selection,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it('preserves safe legacy null identities and rejects ambiguity without an explicit selection', async () => {
    const { manager } = setup();
    await expect(
      resolveReEvaluationSource(manager, 'tenant', {
        student_user_id: 'student',
        subject_id: 362,
        source_result_id: null,
        source_session_id: null,
        source_mark_id: null,
      }),
    ).resolves.toEqual(source());
    const ambiguous = setup([source(), source('MID_TERM')]);
    await expect(
      resolveReEvaluationSource(ambiguous.manager, 'tenant', {
        student_user_id: 'student',
        subject_id: 362,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires selected identities to be UUIDs at the request boundary', async () => {
    const dto = Object.assign(new CreateExamApplicationDto(), {
      subject_id: 362,
      application_type: 'RE_EVALUATION',
      source_result_id: 'not-a-uuid',
      source_session_id: 'not-a-uuid',
    });
    expect((await validate(dto)).map((error) => error.property)).toEqual(
      expect.arrayContaining(['source_result_id', 'source_session_id']),
    );
  });

  it('adds nullable source identities without rewriting historical records', () => {
    const sql = readFileSync(
      join(
        __dirname,
        '../../../migrations/20261021160000_revaluation_source_identity.sql',
      ),
      'utf8',
    );
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS source_result_id UUID');
    expect(sql).toContain(
      'REFERENCES academic_exam_results(result_id) ON DELETE RESTRICT',
    );
    expect(sql).toContain(
      'REFERENCES exam_result_sessions(session_id) ON DELETE RESTRICT',
    );
    expect(sql).toContain(
      'REFERENCES academic_marks(mark_id) ON DELETE RESTRICT',
    );
    expect(sql).not.toMatch(
      /\b(?:UPDATE|DELETE|TRUNCATE|DROP)\s+(?:exam_applications|TABLE)/i,
    );
  });
  it('blocks reassessment after locking an original report that already has a retake', async () => {
    const selected = { ...source(), source_report_id: 'original-report' };
    const { manager, query } = setup([selected]);
    query.mockImplementation((sql: string) =>
      Promise.resolve(
        sql.includes('SELECT ar.result_id, c.course_id')
          ? [selected]
          : sql.includes('SELECT attempt_id FROM exam_backlog_attempts')
            ? ([{ attempt_id: 'retake' }] as never)
            : [],
      ),
    );
    await expect(
      resolveReEvaluationSource(manager, 'tenant', {
        student_user_id: 'student',
        subject_id: 362,
        source_result_id: selected.result_id,
      }),
    ).rejects.toThrow('already has a backlog or supplementary attempt');
    expect(query.mock.calls[0][0]).toContain('FOR UPDATE OF r, s, m, ar');
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining("status <> 'REJECTED'"),
      ['tenant', 'student', 'original-report'],
    );
  });
});
