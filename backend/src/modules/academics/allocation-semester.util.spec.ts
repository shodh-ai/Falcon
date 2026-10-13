import {
  allocationMatchesStudentSlot,
  parseAllocationSemester,
  programsMatch,
} from './allocation-semester.util';

describe('pharmacy allocation programme matching', () => {
  it('keeps B.Pharm, D.Pharm and M.Pharm Pharmaceutics isolated', () => {
    expect(programsMatch('B.Pharm', 'B.Pharm')).toBe(true);
    expect(programsMatch('B.Pharm', 'B.Pharm - Lateral Entry')).toBe(true);
    expect(programsMatch('B.Pharm', 'D.Pharm')).toBe(false);
    expect(programsMatch('B.Pharm', 'M.Pharm Pharmaceutics')).toBe(false);
    expect(programsMatch('D.Pharm', 'B.Pharm')).toBe(false);
    expect(programsMatch('D.Pharm', 'M.Pharm Pharmaceutics')).toBe(false);
    expect(programsMatch('M.Pharm Pharmaceutics', 'B.Pharm')).toBe(false);
    expect(programsMatch('M.Pharm Pharmaceutics', 'D.Pharm')).toBe(false);
  });

  it('matches a lateral B.Pharm student to first-semester B.Pharm allocations', () => {
    expect(
      allocationMatchesStudentSlot(
        'I',
        'B.Pharm',
        1,
        null,
        'B.Pharm - Lateral Entry',
      ),
    ).toBe(true);
    expect(
      allocationMatchesStudentSlot('I', 'D.Pharm', 1, null, 'B.Pharm'),
    ).toBe(false);
  });

  it('never merges programmes merely because their discipline names overlap', () => {
    expect(programsMatch('BTECH CSE', 'MTECH CSE')).toBe(false);
    expect(programsMatch('MTECH CSE', 'BTECH CSE')).toBe(false);
    expect(programsMatch('MTECH CSE', 'B.Tech Mechanical')).toBe(false);
    expect(programsMatch('B.Tech ME', 'B.TECH MECH')).toBe(true);
    expect(programsMatch('BTECH CSE', 'B.Tech Computer Science')).toBe(true);
    expect(programsMatch('BSC AGRICULTURE', 'Agriculture')).toBe(true);
    expect(programsMatch('B.ED EDUCATION', 'Education')).toBe(true);
    expect(programsMatch('BBA ISBM', 'ISBM')).toBe(true);
    expect(programsMatch('B.TECH C3WR', 'C3WR')).toBe(true);
    expect(programsMatch('BSC AGRICULTURE', 'Applied Sciences')).toBe(false);
    expect(programsMatch(null, 'B.Pharm')).toBe(false);
    expect(programsMatch('B.Pharm', '')).toBe(false);
  });

  it('keeps sections and unknown semester labels out of a student roster', () => {
    expect(parseAllocationSemester('Semester 3-A')).toEqual({ semesterNum: 3, sectionCode: 'A' });
    expect(allocationMatchesStudentSlot('III-A', 'BTECH CSE', 3, 'A', 'BTECH CSE')).toBe(true);
    expect(allocationMatchesStudentSlot('III-B', 'BTECH CSE', 3, 'A', 'BTECH CSE')).toBe(false);
    expect(allocationMatchesStudentSlot('III-B', 'BTECH CSE', 3, null, 'BTECH CSE')).toBe(false);
    expect(allocationMatchesStudentSlot('unknown', 'B.Pharm', 1, null, 'B.Pharm')).toBe(false);
  });
});
