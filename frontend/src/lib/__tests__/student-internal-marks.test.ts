import { describe, expect, it } from 'vitest';
import {
  formatAssessmentNumber,
  summarizeInternalMarks,
  type AssessmentMark,
} from '@/lib/student-internal-marks';

function mark(key: string, obtained: AssessmentMark['marks_obtained'], maximum: AssessmentMark['max_marks'], label = key): AssessmentMark {
  return { key, label, marks_obtained: obtained, max_marks: maximum };
}

describe('recorded internal marks calculations', () => {
  it('uses every actual recorded assessment, including quizzes and digital assignments', () => {
    const result = summarizeInternalMarks([
      mark('QUIZ-0', 8, 10, 'Quiz 1'),
      mark('DA-1', 16, 20, 'Digital assignment'),
      mark('PROJECT-2', 9, 10, 'Project review'),
    ]);
    expect(result).toMatchObject({ obtained: 33, maximum: 40, percentage: 82.5, recordedCount: 3, excludedCount: 0 });
    expect(result.internal.map((row) => row.label)).toEqual(['Quiz 1', 'Digital assignment', 'Project review']);
    expect(result.endTerm).toHaveLength(0);
  });

  it('calculates the percentage from summed marks, not the mean of assessment percentages', () => {
    const result = summarizeInternalMarks([mark('QUIZ-0', 9, 10), mark('DA-1', 10, 20)]);
    expect(result).toMatchObject({ obtained: 19, maximum: 30, percentage: 63.33 });
    expect(result.percentage).not.toBe(70);
  });

  it('does not assume a fixed weekly maximum or ignore later weekly assessments', () => {
    const result = summarizeInternalMarks([mark('WT1-0', 3, 4), mark('WT2-1', 7, 8), mark('WT3-2', 5, 6)]);
    expect(result).toMatchObject({ obtained: 15, maximum: 18, percentage: 83.33, recordedCount: 3 });
  });

  it('keeps separate assessments of the same type instead of taking just the first matching key', () => {
    const result = summarizeInternalMarks([mark('QUIZ-0', 2, 5), mark('QUIZ-1', 4, 5)]);
    expect(result).toMatchObject({ obtained: 6, maximum: 10, percentage: 60, recordedCount: 2 });
    expect(result.internal).toHaveLength(2);
  });

  it('separates both supported end-term keys from the internal numerator and denominator', () => {
    const result = summarizeInternalMarks([
      mark('QUIZ-0', 8, 10),
      mark('END_TERM-1', 60, 100),
      mark('ETE-2', 20, 40),
    ]);
    expect(result).toMatchObject({ obtained: 8, maximum: 10, percentage: 80, recordedCount: 1, excludedCount: 0 });
    expect(result.internal.map((row) => row.key)).toEqual(['QUIZ-0']);
    expect(result.endTerm.map((row) => row.key)).toEqual(['END_TERM-1', 'ETE-2']);
  });

  it('does not classify unrelated type prefixes as end-term marks', () => {
    const result = summarizeInternalMarks([mark('ETE_PROJECT-0', 5, 10), mark('END_TERM_PRACTICE-1', 8, 10)]);
    expect(result).toMatchObject({ obtained: 13, maximum: 20, recordedCount: 2 });
    expect(result.endTerm).toHaveLength(0);
  });

  it('preserves a genuinely recorded zero', () => {
    const result = summarizeInternalMarks([mark('QUIZ-0', 0, 10)]);
    expect(result).toMatchObject({ obtained: 0, maximum: 10, percentage: 0, recordedCount: 1, excludedCount: 0 });
    expect(result.internal[0]).toMatchObject({ obtained: 0, maximum: 10, valid: true });
  });

  it('accepts valid decimal strings from the API without inventing a default maximum', () => {
    const result = summarizeInternalMarks([mark('DA-0', '7.5', '12.5'), mark('QUIZ-1', '0', '2.5')]);
    expect(result).toMatchObject({ obtained: 7.5, maximum: 15, percentage: 50, recordedCount: 2 });
  });

  it.each([undefined, null, []])('returns no total for an empty set (%s)', (components) => {
    expect(summarizeInternalMarks(components)).toMatchObject({
      internal: [], endTerm: [], obtained: null, maximum: null, percentage: null, recordedCount: 0, excludedCount: 0,
    });
  });

  it('does not count pending, invalid, negative, out-of-range, or zero-maximum marks', () => {
    const components = [
      mark('PENDING-0', null, 20),
      mark('BLANK-1', '', 20),
      mark('SPACE-2', '  ', 20),
      mark('TEXT-3', 'not a number', 20),
      mark('NEGATIVE-4', -1, 20),
      mark('OVER-5', 21, 20),
      mark('ZERO_MAX-6', 0, 0),
      mark('NO_MAX-7', 1, null),
      mark('INFINITE-8', Number.POSITIVE_INFINITY, 20),
      mark('INFINITE_MAX-9', 10, Number.POSITIVE_INFINITY),
      mark('VALID-10', 4, 5),
    ];
    const result = summarizeInternalMarks(components);
    expect(result).toMatchObject({ obtained: 4, maximum: 5, percentage: 80, recordedCount: 1, excludedCount: 10 });
    expect(result.internal).toHaveLength(11);
    expect(result.internal.filter((row) => row.valid)).toHaveLength(1);
  });

  it('does not turn all unavailable marks into a false zero result', () => {
    const result = summarizeInternalMarks([mark('DA-0', null, 20), mark('QUIZ-1', 5, 0)]);
    expect(result).toMatchObject({ obtained: null, maximum: null, percentage: null, recordedCount: 0, excludedCount: 2 });
  });

  it('returns no internal total if only end-term results exist', () => {
    const result = summarizeInternalMarks([mark('END_TERM-0', 78, 100)]);
    expect(result).toMatchObject({ obtained: null, maximum: null, percentage: null, recordedCount: 0, excludedCount: 0 });
    expect(result.endTerm).toHaveLength(1);
  });

  it('preserves decimal precision in totals until presentation', () => {
    const result = summarizeInternalMarks([mark('DA-0', 1.25, 2.5), mark('QUIZ-1', 1.75, 2)]);
    expect(result).toMatchObject({ obtained: 3, maximum: 4.5, percentage: 66.67 });
  });

  it('does not mutate API marks while normalizing them', () => {
    const components = [mark('QUIZ-0', '8', '10')];
    const before = structuredClone(components);
    summarizeInternalMarks(components);
    expect(components).toEqual(before);
  });
});

describe('assessment number presentation', () => {
  it.each([[0, '0'], [8, '8'], [8.5, '8.5'], [63.333333, '63.33'], [100, '100']])('formats %s as %s', (value, expected) => {
    expect(formatAssessmentNumber(value as number)).toBe(expected);
  });
});
