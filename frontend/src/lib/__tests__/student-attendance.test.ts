import { describe, expect, it } from 'vitest';
import {
  getAttendanceSemesters,
  getCurrentAttendanceSemester,
  getSemesterAttendance,
  type StudentAttendanceData,
  type StudentAttendanceSubject,
} from '@/lib/student-attendance';

function subject(semester: number, attended: number, marked: number): StudentAttendanceSubject {
  return {
    course_code: `TEST-${semester}`,
    course_name: 'Synthetic attendance test',
    semester,
    attendance_percent: '99',
    status: 'ENROLLED',
    present_count: attended,
    absent_count: marked - attended,
    total_classes: marked,
  };
}

function data(overrides: Partial<StudentAttendanceData> = {}): StudentAttendanceData {
  return { overall_percent: 50, subject_wise: [], progression: [], ...overrides };
}

describe('Shared student semester attendance', () => {
  it('uses the authoritative current semester even when historical and future courses exist', () => {
    const attendance = data({ current_semester: 2, subject_wise: [subject(1, 0, 8), subject(2, 5, 6), subject(3, 9, 10)] });
    const semester = getCurrentAttendanceSemester(attendance);
    expect(semester).toBe(2);
    expect(getSemesterAttendance(attendance.subject_wise, semester)).toEqual({ attended: 5, marked: 6, percent: (5 / 6) * 100, classesNeeded: 0 });
  });

  it('weights class counts rather than stored course percentages', () => {
    const subjects = [subject(2, 1, 1), subject(2, 1, 9), subject(2, 0, 0), subject(1, 10, 10)];
    expect(getSemesterAttendance(subjects, 2)).toEqual({ attended: 2, marked: 10, percent: 20, classesNeeded: 22 });
    expect(subjects[0].attendance_percent).toBe('99');
  });

  it('does not manufacture attendance or recovery classes when none are marked', () => {
    expect(getSemesterAttendance([subject(1, 0, 0), subject(2, 5, 6)], 1)).toEqual({ attended: 0, marked: 0, percent: null, classesNeeded: null });
    expect(getSemesterAttendance([], null).percent).toBeNull();
  });

  it('distinguishes no attendance from no marked classes', () => {
    expect(getSemesterAttendance([subject(1, 0, 5)], 1)).toEqual({ attended: 0, marked: 5, percent: 0, classesNeeded: 15 });
  });

  it.each([
    [1, 2, 2],
    [2, 3, 1],
    [3, 4, 0],
    [4, 4, 0],
  ])('calculates recovery classes from %i attended out of %i marked without assuming a fixed class count', (attended, marked, needed) => {
    expect(getSemesterAttendance([subject(2, attended, marked)], 2).classesNeeded).toBe(needed);
  });

  it('builds valid sorted tabs from actual data, excluding future progression placeholders', () => {
    const attendance = data({
      current_semester: 5,
      subject_wise: [subject(3, 1, 1), subject(3, 1, 1), subject(-1, 1, 1), subject(1.5, 1, 1)],
      progression: [{ semester: 8, status: 'UPCOMING', courses_count: 0 }],
    });
    expect(getAttendanceSemesters(attendance)).toEqual([3, 5]);
    expect(getCurrentAttendanceSemester(attendance)).toBe(5);
    expect(getSemesterAttendance(attendance.subject_wise, 5).percent).toBeNull();
  });

  it('uses the latest recorded semester only when current semester is unavailable', () => {
    expect(getCurrentAttendanceSemester(data({ subject_wise: [subject(3, 1, 1), subject(1, 1, 1)] }))).toBe(3);
    expect(getCurrentAttendanceSemester(data({ current_semester: 0, subject_wise: [subject(2, 1, 1)] }))).toBe(2);
    expect(getCurrentAttendanceSemester(null)).toBeNull();
  });
});
