import { describe, expect, it } from 'vitest';
import { completeAttendancePayload, initializeAttendanceForm } from '../attendance-form';

describe('faculty attendance form safety', () => {
  const roster = [{ student_id: 'a' }, { student_id: 'b' }];

  it('defaults every scheduled student to absent and ignores stale outsiders', () => {
    expect(initializeAttendanceForm(roster, [
      { student_id: 'a', status: 'PRESENT' },
      { student_id: 'stale', status: 'PRESENT' },
    ])).toEqual({ a: 'PRESENT', b: 'ABSENT' });
  });

  it('maps the faculty Leave label to the persisted EXCUSED status', () => {
    expect(completeAttendancePayload(roster, { a: 'LEAVE', b: 'ABSENT' })).toEqual([
      { student_id: 'a', status: 'EXCUSED' },
      { student_id: 'b', status: 'ABSENT' },
    ]);
  });

  it('builds a complete payload even when the UI search hides a student', () => {
    expect(completeAttendancePayload(roster, { a: 'PRESENT' })).toEqual([
      { student_id: 'a', status: 'PRESENT' },
      { student_id: 'b', status: 'ABSENT' },
    ]);
  });
});
