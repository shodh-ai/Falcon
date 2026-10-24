import { describe, expect, it } from 'vitest';
import { validateMarksImport } from '../marks-import';

const roster = [
  { student_user_id: 'uuid-1', roll_number: '001', name: 'Asha' },
  { student_user_id: 'uuid-2', roll_number: '002', name: 'Ravi' },
];
const valid = [
  { student_user_id: 'uuid-1', roll_number: '001', student_name: 'Asha', marks_obtained: 10 },
  { student_user_id: 'uuid-2', roll_number: '002', student_name: 'Ravi', marks_obtained: 7.5 },
];

describe('exact course mark-sheet mapping', () => {
  it('accepts only a complete roster with exact identity matches', () => {
    expect(validateMarksImport(valid, roster, 10)).toHaveLength(2);
  });
  it('rejects an unknown or mismatched student', () => {
    expect(() => validateMarksImport([{ ...valid[0], student_user_id: 'other' }, valid[1]], roster, 10)).toThrow('not in this course');
    expect(() => validateMarksImport([{ ...valid[0], roll_number: '002' }, valid[1]], roster, 10)).toThrow('roll number');
  });
  it('rejects duplicate, missing, and out-of-range marks', () => {
    expect(() => validateMarksImport([valid[0], valid[0]], roster, 10)).toThrow('duplicate student');
    expect(() => validateMarksImport([valid[0]], roster, 10)).toThrow('roster has 2');
    expect(() => validateMarksImport([{ ...valid[0], marks_obtained: 11 }, valid[1]], roster, 10)).toThrow('0 to 10');
  });
});
