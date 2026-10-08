import {
  allocationMatchesStudentSlot,
  normalizeProgram,
  parseAllocationSemester,
} from '../../../backend/src/modules/academics/allocation-semester.util';

describe('allocation-semester.util', () => {
  describe('parseAllocationSemester', () => {
    it('parses roman numeral and section', () => {
      expect(parseAllocationSemester('III-A')).toEqual({
        semesterNum: 3,
        sectionCode: 'A',
      });
    });

    it('returns nulls for empty input', () => {
      expect(parseAllocationSemester('')).toEqual({
        semesterNum: null,
        sectionCode: null,
      });
      expect(parseAllocationSemester(null)).toEqual({
        semesterNum: null,
        sectionCode: null,
      });
    });

    it('handles unknown roman numerals', () => {
      expect(parseAllocationSemester('XII-B').semesterNum).toBeNull();
    });
  });

  describe('normalizeProgram', () => {
    it('strips spaces and uppercases', () => {
      expect(normalizeProgram(' b.tech cse ')).toBe('B.TECHCSE');
    });
  });

  describe('allocationMatchesStudentSlot', () => {
    it('matches semester program and section', () => {
      expect(
        allocationMatchesStudentSlot('III-A', 'BTECH', 3, 'A', 'BTECH'),
      ).toBe(true);
    });

    it('rejects semester mismatch', () => {
      expect(allocationMatchesStudentSlot('IV-A', 'BTECH', 3, 'A', 'BTECH')).toBe(
        false,
      );
    });

    it('rejects program mismatch', () => {
      expect(
        allocationMatchesStudentSlot('III-A', 'MECH', 3, 'A', 'BTECH'),
      ).toBe(false);
    });

    it('matches ME allocation label to Mechanical Engineering batch', () => {
      expect(
        allocationMatchesStudentSlot(
          'VII-A',
          'B.Tech ME',
          7,
          'A',
          'B.Tech Mechanical Engineering',
        ),
      ).toBe(true);
    });

    it('rejects section mismatch', () => {
      expect(
        allocationMatchesStudentSlot('III-B', 'BTECH', 3, 'A', 'BTECH'),
      ).toBe(false);
    });
  });
});
