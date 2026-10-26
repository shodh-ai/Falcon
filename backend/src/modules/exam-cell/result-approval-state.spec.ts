import {
  matchesResultApprovalState,
  resultApprovalState,
  type ResultApprovalMark,
  type ResultApprovalSession,
} from './result-approval-state';

describe('result approval state fingerprint', () => {
  const session: ResultApprovalSession = {
    session_id: 'session-a',
    tenant_id: 'tenant-a',
    course_id: 'course-a',
    exam_type: 'FINAL',
    semester: 4,
    max_marks: 100,
    pass_marks: 40,
    grading_policy_id: 3,
    entry_status: 'LOCKED',
    marks_locked: true,
    marks_locked_at: new Date('2026-10-21T10:00:00.123Z'),
  };
  const marks: ResultApprovalMark[] = [
    {
      mark_id: 'mark-b',
      student_user_id: 'student-b',
      marks_obtained: '82.00',
      max_marks: '100.00',
      status: 'PENDING_COE',
      updated_at: '2026-10-21 09:00:00.123456+00',
      revision: '19',
    },
    {
      mark_id: 'mark-a',
      student_user_id: 'student-a',
      marks_obtained: '74.00',
      max_marks: '100.00',
      status: 'PENDING_COE',
      updated_at: '2026-10-21 09:00:00.123457+00',
      revision: '20',
    },
  ];
  const rules = {
    bands: [
      { minPercent: 80, maxPercent: 100, grade: 'A', gradePoints: 9 },
      { minPercent: 0, maxPercent: 79.99, grade: 'B', gradePoints: 8 },
    ],
  };
  const fingerprint = () => resultApprovalState(session, marks, rules, '12');

  it('is stable across row and recursive object-key ordering without mutating inputs', () => {
    const reorderedRules = {
      bands: rules.bands.map((band) => ({
        gradePoints: band.gradePoints,
        grade: band.grade,
        maxPercent: band.maxPercent,
        minPercent: band.minPercent,
      })),
    };
    expect(
      resultApprovalState(session, [...marks].reverse(), reorderedRules, '12'),
    ).toEqual(fingerprint());
    expect(marks.map((mark) => mark.mark_id)).toEqual(['mark-b', 'mark-a']);
  });

  it('normalizes numeric database values and Date/ISO timestamps consistently', () => {
    expect(
      resultApprovalState(
        {
          ...session,
          semester: '4',
          max_marks: '100.00',
          pass_marks: '40.0',
          grading_policy_id: '3',
          marks_locked_at: '2026-10-21 15:30:00.123000+05:30',
        },
        marks.map((mark) => ({
          ...mark,
          marks_obtained: Number(mark.marks_obtained),
          max_marks: 100,
          revision: Number(mark.revision),
        })),
        rules,
        '12',
      ),
    ).toEqual(fingerprint());
  });

  it.each([
    ['session_id', 'session-b'],
    ['tenant_id', 'tenant-b'],
    ['course_id', 'course-b'],
    ['exam_type', 'MIDTERM'],
    ['semester', 5],
    ['max_marks', 90],
    ['pass_marks', 50],
    ['grading_policy_id', 4],
    ['entry_status', 'OPEN'],
    ['marks_locked', false],
    ['marks_locked_at', '2026-10-21T10:00:00.124Z'],
  ])('rejects a snapshot after the session %s changes', (key, value) => {
    const changed = resultApprovalState(
      { ...session, [key]: value },
      marks,
      rules,
      '12',
    );
    expect(matchesResultApprovalState(fingerprint(), changed)).toBe(false);
  });

  it.each([
    ['mark_id', 'replacement-mark'],
    ['student_user_id', 'different-student'],
    ['marks_obtained', 83],
    ['max_marks', 90],
    ['status', 'DRAFT'],
    ['updated_at', '2026-10-21 09:00:00.123458+00'],
    ['revision', '21'],
  ])('rejects a snapshot after mark %s changes', (key, value) => {
    const changed = resultApprovalState(
      session,
      [{ ...marks[0], [key]: value }, marks[1]],
      rules,
      '12',
    );
    expect(matchesResultApprovalState(fingerprint(), changed)).toBe(false);
  });

  it('detects a student removed from or added to the result batch', () => {
    expect(
      matchesResultApprovalState(
        fingerprint(),
        resultApprovalState(session, marks.slice(1), rules, '12'),
      ),
    ).toBe(false);
    expect(
      matchesResultApprovalState(
        fingerprint(),
        resultApprovalState(
          session,
          [...marks, { ...marks[0], mark_id: 'mark-c' }],
          rules,
          '12',
        ),
      ),
    ).toBe(false);
  });

  it('detects changed policy contents and policy revisions', () => {
    expect(
      resultApprovalState(
        session,
        marks,
        { bands: [{ ...rules.bands[0], grade: 'A+' }, rules.bands[1]] },
        '12',
      ),
    ).not.toEqual(fingerprint());
    expect(resultApprovalState(session, marks, rules, '13')).not.toEqual(
      fingerprint(),
    );
  });

  it('does not invalidate approval merely for regenerated preview metadata', () => {
    expect(
      resultApprovalState(
        {
          ...session,
          updated_at: '2026-10-21T12:00:00Z',
          processed_at: '2026-10-21T12:00:00Z',
          processed_by: 'preview-actor',
        },
        marks,
        rules,
        '12',
      ),
    ).toEqual(fingerprint());
  });

  it.each([
    undefined,
    null,
    {},
    [],
    'APPROVED',
    { status: 'APPROVED' },
    { version: 1, digest: '' },
    { version: 1, digest: 'abc' },
    { version: 1, digest: 'z'.repeat(64) },
    { version: 2, digest: 'a'.repeat(64) },
    { version: '1', digest: 'a'.repeat(64) },
  ])('rejects missing, legacy, or malformed approval evidence: %j', (value) => {
    expect(matchesResultApprovalState(value, fingerprint())).toBe(false);
  });

  it('matches valid current evidence without storing raw students or marks', () => {
    const state = fingerprint();
    expect(matchesResultApprovalState(state, state)).toBe(true);
    expect(Object.keys(state).sort()).toEqual(['digest', 'version']);
    expect(state.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(state)).not.toContain('student-a');
    expect(JSON.stringify(state)).not.toContain('marks_obtained');
  });

  it('fails closed on malformed numeric inputs instead of hashing them as null', () => {
    expect(() =>
      resultApprovalState({ ...session, max_marks: Number.NaN }, marks, rules),
    ).toThrow(TypeError);
    expect(() =>
      resultApprovalState(session, [{ ...marks[0], marks_obtained: '' }], rules),
    ).toThrow(TypeError);
  });
});
