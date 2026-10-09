import {
  allocationMatchesStudentSlot,
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
});
