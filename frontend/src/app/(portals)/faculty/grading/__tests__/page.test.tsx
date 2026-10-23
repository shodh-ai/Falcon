import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FacultyGradingPage from '../page';
import type { FacultyCourse } from '@/components/faculty/useFacultyCourses';

const fixtures = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  courses: [] as FacultyCourse[],
  coursesLoading: false,
  coursesError: null as string | null,
}));

const teachingCourse: FacultyCourse = {
  course_id: 'course-1',
  course_code: 'CS101',
  course_name: 'Algorithms',
  credits: 3,
};

const roster = [{
  student_user_id: 'student-1',
  name: 'Enrolled Student',
  roll_number: 'A001',
  marks: { GA1: { obtained: 3, status: 'DRAFT' } },
}];

vi.mock('@/lib/api', () => ({ useAuthedApi: () => fixtures.api }));
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
}));
vi.mock('@/lib/faculty-demo-mode', () => ({
  withFacultyDemoFallback: (live: unknown) => live,
  isEmptyArray: (value: unknown) => Array.isArray(value) && value.length === 0,
  isFacultyDemoEntityId: () => false,
}));

beforeEach(() => {
  vi.clearAllMocks();
  fixtures.api = { get: vi.fn(), post: vi.fn() };
  fixtures.api.get.mockReset().mockResolvedValue(roster);
  fixtures.api.post.mockReset().mockResolvedValue({});
  fixtures.courses = [teachingCourse];
  fixtures.coursesLoading = false;
  fixtures.coursesError = null;
  window.localStorage.clear();
});

describe('grading save safeguards', () => {
  it('hides the previous course roster until the next course has loaded', async () => {
    fixtures.courses = [teachingCourse, { ...teachingCourse, course_id: 'course-2', course_code: 'CS102' }];
    render(<FacultyGradingPage />);
    await selectTeachingCourse();
    let finish!: (value: typeof roster) => void;
    fixtures.api.get.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    fireEvent.change(courseSelect(), { target: { value: 'course-2' } });
    expect(screen.queryByText('Enrolled Student')).not.toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    await act(async () => { finish([{ ...roster[0], name: 'Second Course Student' }]); });
    expect(screen.getByText('Second Course Student')).toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
  });

  it('publishes once after a single draft save when publish is clicked repeatedly', async () => {
    let finish!: (value: object) => void;
    fixtures.api.post.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }))
      .mockResolvedValue({ published: 1, notified_count: 1 });
    render(<FacultyGradingPage />);
    await selectTeachingCourse();
    const publish = publishButton();
    act(() => { fireEvent.click(publish); fireEvent.click(publish); });
    expect(fixtures.api.post).toHaveBeenCalledTimes(1);
    await act(async () => { finish({}); });
    await waitFor(() => expect(fixtures.api.post).toHaveBeenCalledTimes(2));
    expect(fixtures.api.post.mock.calls.filter(([path]) => path.endsWith('/publish-all'))).toHaveLength(1);
  });

  it('sends one draft for repeated clicks while saving', async () => {
    let finish!: (value: object) => void;
    fixtures.api.post.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    render(<FacultyGradingPage />);
    await selectTeachingCourse();
    const save = saveButton();
    act(() => { fireEvent.click(save); fireEvent.click(save); });
    expect(fixtures.api.post).toHaveBeenCalledTimes(1);
    expect(courseSelect()).toBeDisabled();
    await act(async () => { finish({}); });
    await waitFor(() => expect(saveButton()).toBeEnabled());
  });

  it('does not publish after a pending draft completes for a previous account', async () => {
    let finish!: (value: object) => void;
    const previous = fixtures.api;
    previous.post.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const view = render(<FacultyGradingPage />);
    await selectTeachingCourse();
    fireEvent.click(publishButton());
    expect(previous.post).toHaveBeenCalledTimes(1);
    fixtures.api = { get: vi.fn().mockResolvedValue([]), post: vi.fn() };
    view.rerender(<FacultyGradingPage />);
    await act(async () => { finish({}); });
    expect(previous.post).toHaveBeenCalledTimes(1);
    expect(previous.get).toHaveBeenCalledTimes(1);
    expect(fixtures.api.post).not.toHaveBeenCalled();
    expect(fixtures.toast.success).not.toHaveBeenCalled();
    expect(screen.queryByText('Enrolled Student')).not.toBeInTheDocument();
  });

  it('validates loaded manual marks before saving or publishing', async () => {
    fixtures.api.get.mockResolvedValue([{ ...roster[0], marks: { GA1: { obtained: 6, status: 'DRAFT' } } }]);
    render(<FacultyGradingPage />);
    await selectTeachingCourse();
    fireEvent.click(publishButton());
    await waitFor(() => expect(fixtures.toast.error).toHaveBeenCalledWith('Enter marks between 0 and 5 for GA1'));
    expect(fixtures.api.post).not.toHaveBeenCalled();
  });

  it('reports a refresh failure after a successful save and retries without saving again', async () => {
    render(<FacultyGradingPage />);
    await selectTeachingCourse();
    fixtures.api.get.mockRejectedValue(new Error('Roster offline'));
    fireEvent.click(saveButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('Draft saved, but marks could not be refreshed. Roster offline');
    expect(fixtures.api.post).toHaveBeenCalledTimes(1);
    expect(saveButton()).toBeDisabled();
    fixtures.api.get.mockResolvedValue(roster);
    fireEvent.click(screen.getByRole('button', { name: 'Retry roster' }));
    await waitFor(() => expect(saveButton()).toBeEnabled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(fixtures.api.post).toHaveBeenCalledTimes(1);
  });
});

afterEach(cleanup);

function courseSelect() {
  return screen.getByRole('combobox', { name: 'Course' });
}

function saveButton() {
  return screen.getByRole('button', { name: 'Save Draft' });
}

function publishButton() {
  return screen.getByRole('button', { name: 'Publish All Marks' });
}

function expectUnavailableActions() {
  expect(screen.getByRole('button', { name: 'Components' })).toBeDisabled();
  expect(saveButton()).toBeDisabled();
  expect(publishButton()).toBeDisabled();
  fireEvent.click(saveButton());
  fireEvent.click(publishButton());
  expect(fixtures.api.post).not.toHaveBeenCalled();
}

async function selectTeachingCourse() {
  fireEvent.change(courseSelect(), { target: { value: teachingCourse.course_id } });
  await screen.findByText('Enrolled Student');
  await waitFor(() => expect(saveButton()).toBeEnabled());
}

describe('grading course availability', () => {
  it('shows loading ahead of a stale course error and disables course actions', () => {
    fixtures.coursesLoading = true;
    fixtures.coursesError = 'Previous request failed';
    render(<FacultyGradingPage />);

    expect(screen.getByRole('option', { name: 'Loading courses…' })).toBeInTheDocument();
    expect(courseSelect()).toBeDisabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expectUnavailableActions();
    expect(fixtures.api.get).not.toHaveBeenCalled();
  });

  it.each([null, 'No courses allocated to your timetable yet.'])(
    'shows an empty assignment state without reporting an API failure (%s)',
    (error) => {
      fixtures.courses = [];
      fixtures.coursesError = error;
      render(<FacultyGradingPage />);

      expect(screen.getByRole('option', { name: 'No courses assigned' })).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('No teaching courses are assigned yet.');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(courseSelect()).toBeDisabled();
      expectUnavailableActions();
      expect(fixtures.api.get).not.toHaveBeenCalled();
    },
  );

  it('reports an actual course API error and prevents using stale course options', () => {
    fixtures.coursesError = 'Course service unavailable';
    render(<FacultyGradingPage />);

    expect(screen.getByRole('option', { name: 'Unable to load courses' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Course service unavailable');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(courseSelect()).toBeDisabled();
    expectUnavailableActions();
    expect(fixtures.api.get).not.toHaveBeenCalled();
  });

  it('waits for an explicit course choice and preserves the seven default components', async () => {
    render(<FacultyGradingPage />);

    expect(courseSelect()).toBeEnabled();
    expectUnavailableActions();
    expect(fixtures.api.get).not.toHaveBeenCalled();
    await selectTeachingCourse();

    expect(screen.getByRole('button', { name: 'Components' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Components' })).toHaveTextContent('7 components selected');
    expect(publishButton()).toBeEnabled();
    expect(screen.getAllByRole('columnheader')).toHaveLength(9);
    fireEvent.click(saveButton());

    await waitFor(() => expect(fixtures.api.post).toHaveBeenCalledExactlyOnceWith(
      '/api/academics/faculty/workspaces/marks/draft',
      {
        course_id: 'course-1',
        exam_type: 'GA1',
        max_marks: 5,
        entries: [{ student_user_id: 'student-1', marks_obtained: 3 }],
      },
    ));
    await waitFor(() => expect(fixtures.toast.success).toHaveBeenCalledWith('Draft saved successfully'));
  });

  it('clears the prior roster when a selected course leaves the teaching scope', async () => {
    const view = render(<FacultyGradingPage />);
    await selectTeachingCourse();
    expect(publishButton()).toBeEnabled();

    fixtures.courses = [{ ...teachingCourse, course_id: 'course-2', course_code: 'CS102' }];
    view.rerender(<FacultyGradingPage />);

    expect(courseSelect()).toBeEnabled();
    expect(screen.queryByText('Enrolled Student')).not.toBeInTheDocument();
    expectUnavailableActions();
    expect(fixtures.api.get).toHaveBeenCalledTimes(1);
  });

  it.each(['loading', 'error'] as const)(
    'blocks an already loaded roster during a course %s transition',
    async (state) => {
      const view = render(<FacultyGradingPage />);
      await selectTeachingCourse();
      if (state === 'loading') fixtures.coursesLoading = true;
      else fixtures.coursesError = 'Assignment refresh failed';
      view.rerender(<FacultyGradingPage />);

      expect(courseSelect()).toBeDisabled();
      expect(screen.queryByText('Enrolled Student')).not.toBeInTheDocument();
      expectUnavailableActions();
    },
  );

  it('ignores an outstanding roster response after the selected course becomes unavailable', async () => {
    let resolveRoster!: (value: typeof roster) => void;
    fixtures.api.get.mockReturnValue(new Promise<typeof roster>((resolve) => { resolveRoster = resolve; }));
    const view = render(<FacultyGradingPage />);
    fireEvent.change(courseSelect(), { target: { value: teachingCourse.course_id } });
    await screen.findByText('Loading roster…');

    fixtures.courses = [];
    view.rerender(<FacultyGradingPage />);
    await act(async () => { resolveRoster(roster); });

    expect(screen.queryByText('Enrolled Student')).not.toBeInTheDocument();
    expect(courseSelect()).toBeDisabled();
    expectUnavailableActions();
  });
});
