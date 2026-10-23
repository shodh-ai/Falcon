import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GradeChangePage from '../page';
import type { FacultyCourse } from '@/components/faculty/useFacultyCourses';

const fixtures = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn() },
  courses: [] as FacultyCourse[],
  coursesLoading: false,
  coursesError: null as string | null,
  pathname: '/faculty/grade-change',
}));

const teachingCourse: FacultyCourse = {
  course_id: 'course-1',
  course_code: 'CS101',
  course_name: 'Algorithms',
  credits: 3,
};

vi.mock('@/lib/api', () => ({ useAuthedApi: () => fixtures.api }));
vi.mock('next/navigation', () => ({ usePathname: () => fixtures.pathname }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: fixtures.toast }));
vi.mock('@/components/ui/select', () => ({
  Select: (props: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} />,
}));
vi.mock('@/components/faculty/useFacultyCourses', () => ({
  useFacultyCourses: () => ({
    courses: fixtures.courses,
    loading: fixtures.coursesLoading,
    error: fixtures.coursesError,
  }),
  uniqueFacultyCoursesByCourseId: (courses: FacultyCourse[]) => courses,
}));
vi.mock('@/lib/faculty-demo-mode', () => ({
  withFacultyDemoFallback: (live: unknown) => live,
  isEmptyArray: (value: unknown) => Array.isArray(value) && value.length === 0,
  isFacultyDemoSmokeId: () => false,
}));

beforeEach(() => {
  vi.clearAllMocks();
  fixtures.api = { get: vi.fn(), post: vi.fn() };
  fixtures.api.get.mockReset().mockResolvedValue([]);
  fixtures.api.post.mockReset().mockResolvedValue({});
  fixtures.courses = [teachingCourse];
  fixtures.coursesLoading = false;
  fixtures.coursesError = null;
  fixtures.pathname = '/faculty/grade-change';
});

describe('grade request save safeguards', () => {
  it.each(['student', 'from grade', 'to grade', 'reason'])(
    'disables submission when the required %s is empty or whitespace', async (field) => {
      render(<GradeChangePage />);
      await screen.findByText('No requests yet');
      fillFacultyRequest();
      expect(submitButton()).toBeEnabled();

      const input = field === 'student' ? screen.getByPlaceholderText('Student user UUID')
        : field === 'from grade' ? screen.getByPlaceholderText('e.g. C')
        : field === 'to grade' ? screen.getByPlaceholderText('e.g. B')
        : screen.getByPlaceholderText(/Post-final correction/);
      for (const value of ['', '   ']) {
        fireEvent.change(input, { target: { value } });
        expect(submitButton()).toBeDisabled();
        fireEvent.click(submitButton());
        expect(fixtures.api.post).not.toHaveBeenCalled();
      }
    },
  );

  it('keeps a failed draft and prevents repeated submissions while the request is pending', async () => {
    let fail!: (error: Error) => void;
    fixtures.api.post.mockReturnValue(new Promise((_, reject) => { fail = reject; }));
    render(<GradeChangePage />);
    await screen.findByText('No requests yet');
    fillFacultyRequest();
    const submit = submitButton();
    act(() => { fireEvent.click(submit); fireEvent.click(submit); });
    expect(fixtures.api.post).toHaveBeenCalledTimes(1);
    expect(screen.getByPlaceholderText(/Post-final correction/)).toBeDisabled();
    await act(async () => { fail(new Error('Request rejected')); });
    expect(fixtures.toast.error).toHaveBeenCalledWith('Request rejected');
    expect(screen.getByPlaceholderText(/Post-final correction/)).toHaveValue('Recheck correction');
    expect(submitButton()).toBeEnabled();
  });

  it('ignores an old account submission after switching accounts', async () => {
    let finish!: (value: object) => void;
    const previous = fixtures.api;
    previous.post.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const view = render(<GradeChangePage />);
    await screen.findByText('No requests yet');
    fillFacultyRequest();
    fireEvent.click(submitButton());
    fixtures.api = { get: vi.fn().mockResolvedValue([]), post: vi.fn() };
    view.rerender(<GradeChangePage />);
    await act(async () => { finish({}); });
    expect(previous.get).toHaveBeenCalledTimes(1);
    expect(fixtures.toast.success).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText(/Post-final correction/)).toHaveValue('');
  });

  it('distinguishes a submitted request from a failed refresh and retries only the list', async () => {
    render(<GradeChangePage />);
    await screen.findByText('No requests yet');
    fillFacultyRequest();
    fixtures.api.get.mockRejectedValue(new Error('List offline'));
    fireEvent.click(submitButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('Request submitted, but the list could not be refreshed. List offline');
    expect(fixtures.toast.success).toHaveBeenCalled();
    fixtures.api.get.mockResolvedValue([]);
    fireEvent.click(screen.getByRole('button', { name: 'Retry requests' }));
    await screen.findByText('No requests yet');
    expect(fixtures.api.post).toHaveBeenCalledTimes(1);
  });

  it('shows and retries a failed department student read without submitting', async () => {
    fixtures.pathname = '/hod/academics/grade-change';
    fixtures.api.get.mockImplementation(async (path: string) => {
      if (path.endsWith('/student-monitor')) throw new Error('Students offline');
      return [];
    });
    render(<GradeChangePage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Students offline');
    expect(screen.getByRole('combobox', { name: 'Department student' })).toBeDisabled();
    fixtures.api.get.mockResolvedValue([{ user_id: 'student-1', name: 'Department Student', enrollment_number: 'A001' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Retry department students' }));
    await screen.findByRole('option', { name: 'Department Student · A001' });
    expect(fixtures.api.post).not.toHaveBeenCalled();
  });
});

afterEach(cleanup);

function submitButton() {
  return screen.getByRole('button', { name: 'Request grade change' });
}

function fillFacultyRequest() {
  fireEvent.change(screen.getByPlaceholderText('Student user UUID'), {
    target: { value: 'student-1' },
  });
  fireEvent.change(screen.getByRole('combobox', { name: /Your teaching subject/ }), {
    target: { value: teachingCourse.course_code },
  });
  fireEvent.change(screen.getByPlaceholderText('e.g. C'), { target: { value: 'c' } });
  fireEvent.change(screen.getByPlaceholderText('e.g. B'), { target: { value: 'b' } });
  fireEvent.change(screen.getByPlaceholderText(/Post-final correction/), {
    target: { value: 'Recheck correction' },
  });
}

describe('grade request subject availability', () => {
  it('shows loading instead of a stale error and blocks submission while subjects load', async () => {
    fixtures.coursesLoading = true;
    fixtures.coursesError = 'Previous request failed';
    render(<GradeChangePage />);

    await screen.findByText('No requests yet');
    expect(screen.getByRole('option', { name: 'Loading subjects…' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Your teaching subject/ })).toBeDisabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(submitButton()).toBeDisabled();
    fireEvent.click(submitButton());
    expect(fixtures.api.post).not.toHaveBeenCalled();
  });

  it.each([null, 'No courses allocated to your timetable yet.'])(
    'shows a neutral empty state for a successful empty subject list (%s)',
    async (error) => {
      fixtures.courses = [];
      fixtures.coursesError = error;
      render(<GradeChangePage />);

      await screen.findByText('No requests yet');
      expect(screen.getByRole('status')).toHaveTextContent('No teaching subjects are assigned yet.');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.queryByText('Unable to load subjects')).not.toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: /Your teaching subject/ })).toBeDisabled();
      expect(submitButton()).toBeDisabled();
      fireEvent.click(submitButton());
      expect(fixtures.api.post).not.toHaveBeenCalled();
    },
  );

  it('shows a genuine subject read error and blocks stale options', async () => {
    fixtures.coursesError = 'Subject service unavailable';
    render(<GradeChangePage />);

    await screen.findByText('No requests yet');
    expect(screen.getByRole('alert')).toHaveTextContent('Subject service unavailable');
    expect(screen.getByRole('option', { name: 'Unable to load subjects' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Your teaching subject/ })).toBeDisabled();
    expect(submitButton()).toBeDisabled();
    fireEvent.click(submitButton());
    expect(fixtures.api.post).not.toHaveBeenCalled();
  });

  it('requires an explicitly selected teaching subject before sending the request', async () => {
    render(<GradeChangePage />);

    await screen.findByText('No requests yet');
    expect(screen.getByRole('combobox', { name: /Your teaching subject/ })).toBeEnabled();
    expect(submitButton()).toBeDisabled();
    fillFacultyRequest();
    expect(submitButton()).toBeEnabled();
    fireEvent.click(submitButton());

    await waitFor(() => expect(fixtures.api.post).toHaveBeenCalledExactlyOnceWith(
      '/api/uos/sis/grade-changes',
      {
        student_user_id: 'student-1',
        course_code: 'CS101',
        from_grade: 'C',
        to_grade: 'B',
        reason: 'Recheck correction',
      },
    ));
    await waitFor(() => expect(fixtures.toast.success).toHaveBeenCalledWith('Submitted — awaiting HOD approval'));
    expect(submitButton()).toBeDisabled();
  });

  it('blocks a previously selected subject when it is removed from the current scope', async () => {
    const view = render(<GradeChangePage />);

    await screen.findByText('No requests yet');
    fillFacultyRequest();
    expect(submitButton()).toBeEnabled();
    fixtures.courses = [{ ...teachingCourse, course_id: 'course-2', course_code: 'CS102' }];
    view.rerender(<GradeChangePage />);

    expect(screen.getByRole('combobox', { name: /Your teaching subject/ })).toBeEnabled();
    expect(submitButton()).toBeDisabled();
    fireEvent.click(submitButton());
    expect(fixtures.api.post).not.toHaveBeenCalled();
  });

  it('preserves the HOD department subject and student selectors', async () => {
    fixtures.pathname = '/hod/academics/grade-change';
    fixtures.api.get.mockImplementation(async (path: string) => path.endsWith('/student-monitor')
      ? [{ user_id: 'student-1', name: 'Department Student', enrollment_number: 'A001' }]
      : []);
    render(<GradeChangePage />);

    await screen.findByRole('option', { name: 'Department Student · A001' });
    expect(screen.getByText('Department Grade Change Requests')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Department student' })).toBeEnabled();
    expect(screen.getByRole('combobox', { name: 'Department subject' })).toBeEnabled();
    expect(screen.getByRole('option', { name: 'Select a department subject' })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Student user UUID')).not.toBeInTheDocument();
    expect(fixtures.api.post).not.toHaveBeenCalled();
  });
});
