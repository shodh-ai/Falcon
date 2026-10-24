import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StudentAcademicProgression } from '@/components/student/StudentAcademicProgression';
import type { StudentAttendanceData } from '@/lib/student-attendance';

type Progression = StudentAttendanceData['progression'];

function semesterItem(semester: number) {
  return screen.getByText(`Semester ${semester}`, { exact: true }).closest('li')!;
}

describe('StudentAcademicProgression', () => {
  afterEach(cleanup);

  it('shows only the supplied semesters in ascending order instead of manufacturing a fixed program', () => {
    render(<StudentAcademicProgression progression={[
      { semester: 9, status: 'UPCOMING', courses_count: 0 },
      { semester: 3, status: 'COMPLETED', courses_count: 2 },
      { semester: 5, status: 'IN_PROGRESS', courses_count: 4 },
    ]} currentSemester={5} />);

    const list = screen.getByRole('list', { name: 'Semester progression' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items.map((item) => within(item).getByText(/^Semester \d+$/).textContent))
      .toEqual(['Semester 3', 'Semester 5', 'Semester 9']);
    expect(screen.queryByText('Semester 1', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText('Semester 8', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('uses current semester metadata for one accessible Falcon-highlighted current step', () => {
    render(<StudentAcademicProgression progression={[
      { semester: 3, status: 'IN_PROGRESS', courses_count: 1 },
      { semester: 5, status: 'COMPLETED', courses_count: 2 },
      { semester: 7, status: 'IN_PROGRESS', courses_count: 0 },
    ]} currentSemester={5} />);

    expect(screen.getByText('Currently in Semester 5')).toBeInTheDocument();
    const current = semesterItem(5);
    expect(current).toHaveAttribute('aria-current', 'step');
    expect(current).toHaveClass('border-sgvu-gold/60', 'bg-sgvu-gold/10');
    expect(within(current).getByText('Current semester')).toBeInTheDocument();
    expect(semesterItem(3)).not.toHaveAttribute('aria-current');
    expect(within(semesterItem(3)).getByText('Previous semester')).toBeInTheDocument();
    expect(semesterItem(7)).not.toHaveAttribute('aria-current');
    expect(within(semesterItem(7)).getByText('Upcoming')).toBeInTheDocument();
  });

  it('uses readable semester stages without claiming past courses were passed or completed', () => {
    render(<StudentAcademicProgression progression={[
      { semester: 1, status: 'COMPLETED', courses_count: 2 },
      { semester: 2, status: 'IN_PROGRESS', courses_count: 3 },
      { semester: 3, status: 'UPCOMING', courses_count: 0 },
    ]} currentSemester={2} />);

    expect(screen.getByText('Academic progression')).toBeInTheDocument();
    expect(screen.getByText('Previous semester')).toBeInTheDocument();
    expect(screen.getByText('Current semester')).toBeInTheDocument();
    expect(screen.getByText('Upcoming')).toBeInTheDocument();
    expect(screen.queryByText(/COMPLETED|IN_PROGRESS|UPCOMING|passed|graduated|100%/)).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('stacks semester labels and icons on narrow cards instead of squeezing them into one row', () => {
    render(<StudentAcademicProgression progression={[
      { semester: 2, status: 'IN_PROGRESS', courses_count: 3 },
    ]} currentSemester={2} />);

    const heading = screen.getByText('Semester 2', { exact: true }).parentElement;
    expect(heading).toHaveClass('flex-col', 'items-start', 'sm:flex-row', 'sm:items-center');
  });

  it('explains singular, plural, and zero registered course counts', () => {
    render(<StudentAcademicProgression progression={[
      { semester: 1, status: 'COMPLETED', courses_count: 1 },
      { semester: 2, status: 'IN_PROGRESS', courses_count: 4 },
      { semester: 3, status: 'UPCOMING', courses_count: 0 },
    ]} currentSemester={2} />);

    expect(within(semesterItem(1)).getByText('1 course registered')).toBeInTheDocument();
    expect(within(semesterItem(2)).getByText('4 courses registered')).toBeInTheDocument();
    expect(within(semesterItem(3)).getByText('No courses registered')).toBeInTheDocument();
  });

  it('shows an honest empty state without inventing semester records', () => {
    render(<StudentAcademicProgression progression={[]} />);

    expect(screen.getByText('No progression data')).toBeInTheDocument();
    expect(screen.getByText('Semester progression will appear as you advance.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Semester progression' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Currently in Semester/)).not.toBeInTheDocument();
  });

  it.each([undefined, 0, -1, 1.5])(
    'uses an honest fallback for unknown statuses with invalid or missing current metadata (%s)',
    (currentSemester) => {
      render(<StudentAcademicProgression progression={[
        { semester: 3, status: 'UNRECOGNIZED_STATUS', courses_count: 1 },
      ]} currentSemester={currentSemester} />);

      expect(screen.getByText('Status unavailable')).toBeInTheDocument();
      expect(semesterItem(3)).not.toHaveAttribute('aria-current');
      expect(screen.queryByText(/Currently in Semester/)).not.toBeInTheDocument();
      expect(screen.queryByText('UNRECOGNIZED_STATUS')).not.toBeInTheDocument();
    },
  );

  it('falls back to known API stages when current semester metadata is missing', () => {
    render(<StudentAcademicProgression progression={[
      { semester: 2, status: 'COMPLETED', courses_count: 1 },
      { semester: 4, status: 'IN_PROGRESS', courses_count: 2 },
      { semester: 6, status: 'UPCOMING', courses_count: 0 },
    ]} />);

    expect(within(semesterItem(2)).getByText('Previous semester')).toBeInTheDocument();
    expect(within(semesterItem(4)).getByText('Current semester')).toBeInTheDocument();
    expect(semesterItem(4)).toHaveAttribute('aria-current', 'step');
    expect(within(semesterItem(6)).getByText('Upcoming')).toBeInTheDocument();
    expect(screen.queryByText(/Currently in Semester/)).not.toBeInTheDocument();
  });

  it('ignores invalid semester numbers rather than displaying misleading cards', () => {
    render(<StudentAcademicProgression progression={[
      { semester: 0, status: 'UPCOMING', courses_count: 0 },
      { semester: -1, status: 'UPCOMING', courses_count: 0 },
      { semester: 1.5, status: 'UPCOMING', courses_count: 0 },
      { semester: Number.NaN, status: 'UPCOMING', courses_count: 0 },
      { semester: 4, status: 'IN_PROGRESS', courses_count: 2 },
    ]} currentSemester={4} />);

    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(semesterItem(4)).toHaveAttribute('aria-current', 'step');
    expect(screen.queryByText('Semester 0', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText('Semester -1', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText('Semester 1.5', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText('Semester NaN', { exact: true })).not.toBeInTheDocument();
  });

  it('does not mutate the API progression array or its rows while sorting', () => {
    const progression: Progression = [
      { semester: 5, status: 'IN_PROGRESS', courses_count: 3 },
      { semester: 1, status: 'COMPLETED', courses_count: 2 },
    ];
    const original = progression.map((row) => ({ ...row }));
    progression.forEach(Object.freeze);
    Object.freeze(progression);

    render(<StudentAcademicProgression progression={progression} currentSemester={5} />);

    expect(progression).toEqual(original);
    expect(screen.getAllByRole('listitem').map((item) => within(item).getByText(/^Semester \d+$/).textContent))
      .toEqual(['Semester 1', 'Semester 5']);
  });
});
