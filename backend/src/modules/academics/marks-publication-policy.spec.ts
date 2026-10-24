import {
  isEndSemesterExamType,
  isFacultyDirectPublicationType,
} from './marks-publication-policy';

describe('marks publication policy', () => {
  it.each(['ETE', 'END_TERM'])('%s requires end-semester control', (type) => {
    expect(isEndSemesterExamType(type)).toBe(true);
    expect(isFacultyDirectPublicationType(type)).toBe(false);
  });

  it.each(['QUIZ', 'GA1', 'MT1', 'CAT1', 'INTERNAL', 'ASSIGNMENT'])
    ('%s may be published by faculty', (type) => {
      expect(isEndSemesterExamType(type)).toBe(false);
      expect(isFacultyDirectPublicationType(type)).toBe(true);
    });
});
