import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isStudentLibraryLaunched,
  isStudentLibraryLoanDue,
} from '@/lib/student-library-launch';

describe('student library launch switch', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('keeps student Library in Coming Soon mode by default', () => {
    vi.stubEnv('NEXT_PUBLIC_STUDENT_LIBRARY_LAUNCHED', '');
    expect(isStudentLibraryLaunched()).toBe(false);
  });

  it.each(['true', '1', 'on', ' ON '])(
    'launches student Library for %s',
    (value) => {
      vi.stubEnv('NEXT_PUBLIC_STUDENT_LIBRARY_LAUNCHED', value);
      expect(isStudentLibraryLaunched()).toBe(true);
    },
  );

  it('does not launch for unrelated values', () => {
    vi.stubEnv('NEXT_PUBLIC_STUDENT_LIBRARY_LAUNCHED', 'yes');
    expect(isStudentLibraryLaunched()).toBe(false);
  });
});

describe('student library due-loan warning', () => {
  const now = new Date('2026-10-14T12:00:00.000Z').getTime();

  it('shows for an explicitly overdue loan', () => {
    expect(isStudentLibraryLoanDue({ status: 'OVERDUE' }, now)).toBe(true);
  });

  it('shows when the due date has arrived or passed', () => {
    expect(
      isStudentLibraryLoanDue(
        { status: 'ISSUED', due_date: '2026-10-14T11:59:00.000Z' },
        now,
      ),
    ).toBe(true);
  });

  it('stays hidden for a genuine future due date', () => {
    expect(
      isStudentLibraryLoanDue(
        { status: 'ISSUED', due_date: '2026-10-15T12:00:00.000Z' },
        now,
      ),
    ).toBe(false);
  });

  it('stays hidden when no due evidence exists', () => {
    expect(isStudentLibraryLoanDue({ status: 'ISSUED' }, now)).toBe(false);
  });
});
