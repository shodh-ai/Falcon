import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FacultyAnalyticsPage from '../page';
import type { FacultyCourse } from '@/components/faculty/useFacultyCourses';

const fixtures = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn() },
  toast: { error: vi.fn() },
  courses: [] as FacultyCourse[],
}));

const course: FacultyCourse = { course_id: 'course-1', course_code: 'CS101', course_name: 'Algorithms', credits: 3 };
const student = (id: string, name: string, score: number | string | null, attendance: number | string | null, marksCount: number, attendanceCount: number) => ({
  student_user_id: id,
  name,
  official_email: `${id}@example.test`,
  roll_number: id,
  department: 'Engineering',
  course_id: course.course_id,
  course_code: course.course_code,
  course_name: course.course_name,
  internal_avg_percent: score,
  published_assessment_count: marksCount,
  attendance_percent: attendance,
  attendance_record_count: attendanceCount,
  assignments_submitted: 0,
});
const roster = [
  student('unknown', 'Unrecorded Student', null, null, 0, 0),
  student('zero', 'Measured Zero', 0, 0, 1, 1),
  student('partial', 'Marks Only Student', 90, null, 1, 0),
  student('strong', 'Recorded Strong Student', 90, 90, 1, 1),
  student('legacy', 'Legacy Empty Student', 0, 24, 0, 0),
  student('invalid', 'Invalid Values Student', 'invalid', '', 1, 1),
];

vi.mock('@/lib/api', () => ({ useAuthedApi: () => fixtures.api }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: fixtures.toast }));
vi.mock('@/components/ui/select', () => ({ Select: (props: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} /> }));
vi.mock('@/components/faculty/useFacultyCourses', () => ({
  useFacultyCourses: () => ({ courses: fixtures.courses, loading: false, error: null }),
  uniqueFacultyCoursesByCourseId: (courses: FacultyCourse[]) => courses,
}));
vi.mock('@/components/faculty/FacultyStudentReport', () => ({
  FacultyStudentReport: ({ report, actions }: { report: { student: { name: string } }; actions: React.ReactNode }) => <section><h2>{report.student.name} report</h2>{actions}</section>,
}));
vi.mock('@/lib/faculty-demo-mode', () => ({
  withFacultyDemoFallback: (live: unknown) => live,
  isEmptyArray: (value: unknown) => Array.isArray(value) && value.length === 0,
  isFacultyDemoSmokeId: () => false,
}));

beforeEach(() => {
  vi.clearAllMocks();
  fixtures.courses = [course];
  fixtures.api.get.mockReset().mockResolvedValue(roster);
  fixtures.api.post.mockReset();
});
afterEach(cleanup);

describe('student performance recorded data', () => {
  it('shows unavailable measures without inventing a zero score or cached attendance', async () => {
    render(<FacultyAnalyticsPage />);
    const list = await screen.findByRole('listbox', { name: 'Subject students' });

    for (const name of ['Unrecorded Student', 'Legacy Empty Student', 'Invalid Values Student']) {
      const row = within(list).getByRole('option', { name: new RegExp(name) });
      expect(row).toHaveTextContent('Published marks Not graded');
      expect(row).toHaveTextContent('Attendance Not recorded');
      expect(row).not.toHaveTextContent('0%');
    }
    const measuredZero = within(list).getByRole('option', { name: /Measured Zero/ });
    expect(measuredZero).toHaveTextContent('Published marks 0%');
    expect(measuredZero).toHaveTextContent('Attendance 0%');
    expect(screen.getByRole('button', { name: 'At risk (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Strong (1)' })).toBeInTheDocument();
  });

  it('excludes missing data from risk and strong filters while preserving measured zero risk', async () => {
    render(<FacultyAnalyticsPage />);
    await screen.findByRole('listbox', { name: 'Subject students' });
    fireEvent.click(screen.getByRole('button', { name: 'At risk (1)' }));
    let list = screen.getByRole('listbox', { name: 'Subject students' });
    expect(within(list).getAllByRole('option')).toHaveLength(1);
    expect(within(list).getByRole('option', { name: /Measured Zero/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Strong (1)' }));
    list = screen.getByRole('listbox', { name: 'Subject students' });
    expect(within(list).getAllByRole('option')).toHaveLength(1);
    expect(within(list).getByRole('option', { name: /Recorded Strong Student/ })).toBeInTheDocument();
    expect(within(list).queryByRole('option', { name: /Marks Only Student/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'All (6)' }));
    expect(within(screen.getByRole('listbox', { name: 'Subject students' })).getAllByRole('option')).toHaveLength(6);
    expect(fixtures.api.post).not.toHaveBeenCalled();
  });

  it('keeps authorized department searches and their reports read-only', async () => {
    const lookup = { ...roster[0], name: 'Department Student', course_id: 'department-course', course_code: 'CS102' };
    fixtures.api.get.mockImplementation(async (path: string) => path.includes('/report?')
      ? { student: { name: lookup.name } }
      : path.includes('/student-directory?') ? [lookup] : roster);
    render(<FacultyAnalyticsPage />);
    await screen.findByRole('listbox', { name: 'Subject students' });
    fireEvent.click(screen.getByRole('button', { name: 'Department student lookup' }));
    fireEvent.change(screen.getByPlaceholderText('Enter at least 2 characters'), { target: { value: 'De' } });
    fireEvent.click(await screen.findByRole('option', { name: /Department Student/ }));

    await screen.findByRole('heading', { name: 'Department Student report' });
    expect(screen.getByText('Read-only department report')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Grade change' })).not.toBeInTheDocument();
    expect(fixtures.api.get).toHaveBeenCalledWith('/api/academics/faculty/workspaces/student-directory?q=De');
    await waitFor(() => expect(fixtures.api.get).toHaveBeenCalledWith('/api/academics/faculty/workspaces/student-directory/unknown/report?courseId=department-course'));
    expect(fixtures.api.post).not.toHaveBeenCalled();
  });
});
