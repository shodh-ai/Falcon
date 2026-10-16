import { describe, expect, it } from 'vitest';
import { getSemesterGpa } from '@/lib/student-semester-gpa';

describe('getSemesterGpa', () => {
  it('returns unavailable when a semester result is absent', () => {
    expect(getSemesterGpa(undefined)).toBeNull();
    expect(getSemesterGpa(null)).toBeNull();
  });

  it('preserves the server credit-weighted score rather than averaging courses again', () => {
    expect(getSemesterGpa({
      sgpa: '7.33', credits_attempted: 6,
      courses: [
        { credits: 4, grade_points: 8, grade: 'B+', status: 'PASS' },
        { credits: 2, grade_points: 6, grade: 'C', status: 'PASS' },
      ],
    })).toBe(7.33);
  });

  it('rejects a default zero when the semester has no graded attempted credits', () => {
    expect(getSemesterGpa({
      sgpa: 0, credits_attempted: 0,
      courses: [{ credits: 4, grade: '—', grade_points: null, status: 'ENROLLED' }],
    })).toBeNull();
  });

  it('preserves a real failed zero when attempted graded credits exist', () => {
    expect(getSemesterGpa({
      sgpa: 0, credits_attempted: 4,
      courses: [{ credits: 4, grade: 'F', grade_points: 0, status: 'FAIL' }],
    })).toBe(0);
  });

  it('trusts an explicit zero attempted-credit count instead of old course snapshots', () => {
    expect(getSemesterGpa({
      sgpa: 9, credits_attempted: 0,
      courses: [{ credits: 4, grade: 'A', grade_points: 9, status: 'PASS' }],
    })).toBeNull();
  });

  it.each([null, '', '   ', 'invalid', 'Infinity', -1, Number.NaN])('rejects invalid or missing server GPA %s', (sgpa) => {
    expect(getSemesterGpa({ sgpa, credits_attempted: 4 })).toBeNull();
  });

  it('does not derive a substitute GPA from course points when the server value is missing', () => {
    expect(getSemesterGpa({
      sgpa: null, credits_attempted: 4,
      courses: [{ credits: 4, grade: 'A', grade_points: 9, status: 'PASS' }],
    })).toBeNull();
  });

  it.each(['FAIL', 'FAILED'])('recognizes a legacy zero as graded with terminal status %s', (status) => {
    expect(getSemesterGpa({ sgpa: 0, courses: [{ credits: 4, grade: 'F', grade_points: 0, status }] })).toBe(0);
  });

  it.each(['PASS', 'COMPLETED'])('accepts legacy passed evidence with terminal status %s', (status) => {
    expect(getSemesterGpa({ sgpa: 9, courses: [{ credits: '4', grade: 'A', grade_points: '9', status }] })).toBe(9);
  });

  it('supports legacy final letter grades when grade-point fields are absent', () => {
    expect(getSemesterGpa({ sgpa: 0, courses: [{ credits: 4, grade: 'F', status: 'FAIL' }] })).toBe(0);
    expect(getSemesterGpa({ sgpa: 8, courses: [{ credits: 4, grade: 'B+', status: 'COMPLETED' }] })).toBe(8);
  });

  it('rejects ungraded or enrolled legacy courses instead of showing their default score', () => {
    expect(getSemesterGpa({ sgpa: 0, courses: [{ credits: 4, grade: '—', status: 'ENROLLED' }] })).toBeNull();
    expect(getSemesterGpa({ sgpa: 0, courses: [{ credits: 4, grade_points: 0, status: 'ENROLLED' }] })).toBeNull();
    expect(getSemesterGpa({ sgpa: 8, courses: [{ credits: 4, grade: 'PENDING', status: 'COMPLETED' }] })).toBeNull();
    expect(getSemesterGpa({ sgpa: 8, courses: [{ credits: 4, grade: 'A', grade_points: null, status: 'COMPLETED' }] })).toBeNull();
  });

  it('does not use zero-credit or invalid-credit courses as graded evidence', () => {
    for (const credits of [0, -1, 'invalid', Number.NaN]) {
      expect(getSemesterGpa({ sgpa: 8, courses: [{ credits, grade_points: 8, status: 'PASS' }] })).toBeNull();
    }
  });
});
