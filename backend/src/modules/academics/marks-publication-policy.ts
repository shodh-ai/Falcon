/** Only final/end-term examinations require an Exam Cell entry window and HOD review. */
export function isEndSemesterExamType(examType: string): boolean {
  return examType === 'ETE' || examType === 'END_TERM';
}

export function isFacultyDirectPublicationType(examType: string): boolean {
  return !isEndSemesterExamType(examType);
}
