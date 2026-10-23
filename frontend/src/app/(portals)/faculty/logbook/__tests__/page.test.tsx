import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FacultyLogbookPage from '../page';
import type { FacultyCourse } from '@/components/faculty/useFacultyCourses';

const fixtures = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn() },
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

const savedEntry = {
  logbook_id: 'entry-1',
  class_date: '2026-10-19',
  topic_summary: 'Searching and sorting',
  course_code: 'CS101',
  course_name: 'Algorithms',
};

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
  uniqueFacultyCoursesByCourseId: (courses: FacultyCourse[]) => courses,
}));
vi.mock('@/lib/faculty-demo-mode', () => ({
  withFacultyDemoFallback: (live: unknown) => live,
  isEmptyArray: (value: unknown) => Array.isArray(value) && value.length === 0,
  isFacultyDemoEntityId: () => false,
}));

beforeEach(() => {
  vi.clearAllMocks();
  fixtures.api.get.mockReset().mockResolvedValue([]);
  fixtures.api.post.mockReset().mockResolvedValue({});
  fixtures.courses = [teachingCourse];
  fixtures.coursesLoading = false;
  fixtures.coursesError = null;
});

afterEach(cleanup);

function courseSelect() {
  return screen.getByRole('combobox', { name: 'Course' });
}

function dateInput() {
  return screen.getByLabelText('Class date');
}

function topicInput() {
  return screen.getByRole('textbox', { name: 'Topic summary' });
}

function saveButton() {
  return screen.getByRole('button', { name: 'Save logbook entry' });
}

function submitForm() {
  fireEvent.submit(topicInput().closest('form')!);
}

function fillDraft(topic = 'Searching and sorting') {
  fireEvent.change(courseSelect(), { target: { value: teachingCourse.course_id } });
  fireEvent.change(dateInput(), { target: { value: '2026-10-19' } });
  fireEvent.change(topicInput(), { target: { value: topic } });
}

describe('logbook course availability', () => {
  it('shows course loading before a stale error and blocks incomplete submissions', async () => {
    fixtures.coursesLoading = true;
    fixtures.coursesError = 'Previous course request failed';
    render(<FacultyLogbookPage />);
    await screen.findByText('No logbook entries yet.');

    expect(screen.getByRole('option', { name: 'Loading courses…' })).toBeInTheDocument();
    expect(courseSelect()).toBeDisabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    submitForm();
    expect(fixtures.api.post).not.toHaveBeenCalled();
  });

  it.each([null, 'No courses allocated to your timetable yet.'])(
    'distinguishes a successful empty course list from an API failure (%s)',
    async (error) => {
      fixtures.courses = [];
      fixtures.coursesError = error;
      render(<FacultyLogbookPage />);
      await screen.findByText('No logbook entries yet.');

      expect(screen.getByRole('option', { name: 'No courses assigned' })).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('No teaching courses are assigned yet.');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(courseSelect()).toBeDisabled();
      expect(saveButton()).toBeDisabled();
      submitForm();
      expect(fixtures.api.post).not.toHaveBeenCalled();
    },
  );

  it('reports a genuine course error and blocks saving retained course options', async () => {
    fixtures.coursesError = 'Course service unavailable';
    render(<FacultyLogbookPage />);
    await screen.findByText('No logbook entries yet.');

    expect(screen.getByRole('option', { name: 'Unable to load courses' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Course service unavailable');
    expect(courseSelect()).toBeDisabled();
    expect(saveButton()).toBeDisabled();
    submitForm();
    expect(fixtures.api.post).not.toHaveBeenCalled();
  });
});

describe('recent logbook entry reads', () => {
  it('shows loading rather than a false empty state before entries arrive', async () => {
    let resolveEntries!: (entries: typeof savedEntry[]) => void;
    fixtures.api.get.mockReturnValue(new Promise<typeof savedEntry[]>((resolve) => { resolveEntries = resolve; }));
    render(<FacultyLogbookPage />);

    expect(screen.getByText('Loading logbook entries…')).toBeInTheDocument();
    expect(screen.queryByText('No logbook entries yet.')).not.toBeInTheDocument();
    await act(async () => { resolveEntries([savedEntry]); });
    expect(screen.getByText('Searching and sorting')).toBeInTheDocument();
    expect(screen.queryByText('Loading logbook entries…')).not.toBeInTheDocument();
  });

  it('shows the empty message only after a successful empty entries response', async () => {
    render(<FacultyLogbookPage />);

    await screen.findByText('No logbook entries yet.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('shows a failed entries read and lets Retry recover without pretending the logbook is empty', async () => {
    fixtures.api.get.mockRejectedValueOnce(new Error('Logbook service unavailable'));
    render(<FacultyLogbookPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Logbook service unavailable');
    expect(screen.queryByText('No logbook entries yet.')).not.toBeInTheDocument();
    fixtures.api.get.mockResolvedValue([savedEntry]);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await screen.findByText('Searching and sorting');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(fixtures.api.get).toHaveBeenCalledTimes(2);
    expect(fixtures.api.post).not.toHaveBeenCalled();
  });
});

describe('logbook draft integrity', () => {
  it('rejects a whitespace-only topic even when the form is submitted directly', async () => {
    render(<FacultyLogbookPage />);
    await screen.findByText('No logbook entries yet.');
    fillDraft('   ');

    expect(saveButton()).toBeDisabled();
    submitForm();
    expect(fixtures.api.post).not.toHaveBeenCalled();
  });

  it('requires a class date and a currently available teaching course', async () => {
    const view = render(<FacultyLogbookPage />);
    await screen.findByText('No logbook entries yet.');
    fillDraft();
    expect(saveButton()).toBeEnabled();
    fireEvent.change(dateInput(), { target: { value: '' } });
    expect(saveButton()).toBeDisabled();
    submitForm();
    expect(fixtures.api.post).not.toHaveBeenCalled();

    fireEvent.change(dateInput(), { target: { value: '2026-10-19' } });
    fixtures.courses = [{ ...teachingCourse, course_id: 'course-2' }];
    view.rerender(<FacultyLogbookPage />);
    expect(saveButton()).toBeDisabled();
    submitForm();
    expect(fixtures.api.post).not.toHaveBeenCalled();
  });

  it('trims the topic before saving and clears only the saved topic afterward', async () => {
    render(<FacultyLogbookPage />);
    await screen.findByText('No logbook entries yet.');
    fillDraft('  Searching and sorting  ');
    fireEvent.click(saveButton());

    await waitFor(() => expect(fixtures.api.post).toHaveBeenCalledExactlyOnceWith(
      '/api/academics/faculty/workspaces/logbook',
      { course_id: 'course-1', class_date: '2026-10-19', topic_summary: 'Searching and sorting' },
    ));
    await waitFor(() => expect(fixtures.toast.success).toHaveBeenCalledWith('Class logbook entry saved'));
    expect(topicInput()).toHaveValue('');
    expect(courseSelect()).toHaveValue('course-1');
    expect(dateInput()).toHaveValue('2026-10-19');
    expect(saveButton()).toBeDisabled();
  });

  it('locks controls and prevents another POST while the same draft is being saved', async () => {
    let resolveSave!: (result: object) => void;
    fixtures.api.post.mockReturnValue(new Promise<object>((resolve) => { resolveSave = resolve; }));
    render(<FacultyLogbookPage />);
    await screen.findByText('No logbook entries yet.');
    fillDraft();
    fireEvent.click(saveButton());

    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(courseSelect()).toBeDisabled();
    expect(dateInput()).toBeDisabled();
    expect(topicInput()).toBeDisabled();
    submitForm();
    expect(fixtures.api.post).toHaveBeenCalledTimes(1);
    await act(async () => { resolveSave({}); });
    expect(topicInput()).toHaveValue('');
  });

  it('preserves the full draft on a failed save so it can be retried', async () => {
    fixtures.api.post.mockRejectedValueOnce(new Error('Save service unavailable'));
    render(<FacultyLogbookPage />);
    await screen.findByText('No logbook entries yet.');
    fillDraft();
    fireEvent.click(saveButton());

    await waitFor(() => expect(fixtures.toast.error).toHaveBeenCalledWith('Save service unavailable'));
    expect(screen.getByRole('alert')).toHaveTextContent('Save service unavailable');
    expect(fixtures.toast.success).not.toHaveBeenCalled();
    expect(courseSelect()).toHaveValue('course-1');
    expect(dateInput()).toHaveValue('2026-10-19');
    expect(topicInput()).toHaveValue('Searching and sorting');
    expect(saveButton()).toBeEnabled();
    expect(fixtures.api.get).toHaveBeenCalledTimes(1);
  });

  it('keeps a successful save separate from a failed list refresh and prevents duplicate resubmission', async () => {
    fixtures.api.get.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('Could not refresh logbook entries'));
    render(<FacultyLogbookPage />);
    await screen.findByText('No logbook entries yet.');
    fillDraft();
    fireEvent.click(saveButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not refresh logbook entries');
    expect(fixtures.toast.success).toHaveBeenCalledExactlyOnceWith('Class logbook entry saved');
    expect(fixtures.toast.error).not.toHaveBeenCalled();
    expect(topicInput()).toHaveValue('');
    expect(saveButton()).toBeDisabled();
    expect(screen.queryByText('No logbook entries yet.')).not.toBeInTheDocument();
    submitForm();
    expect(fixtures.api.post).toHaveBeenCalledTimes(1);

    fixtures.api.get.mockResolvedValue([savedEntry]);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByText('Searching and sorting');
    expect(fixtures.api.post).toHaveBeenCalledTimes(1);
  });
});
