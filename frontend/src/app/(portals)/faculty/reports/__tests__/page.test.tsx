import type { ReactNode, SelectHTMLAttributes } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FacultyReportsPage from '../page';
import type { FacultyCourse } from '@/components/faculty/useFacultyCourses';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  courses: [] as FacultyCourse[],
  loading: false,
  coursesError: null as string | null,
}));
const teachingCourse: FacultyCourse = {
  course_id: 'real-course',
  course_code: 'CS101',
  course_name: 'Test Course',
  credits: 3,
};
let api = { get: mocks.get };
vi.mock('@/lib/api', () => ({ useAuthedApi: () => api }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock('@/components/faculty/useFacultyCourses', () => ({
  useFacultyCourses: () => ({ courses: mocks.courses, loading: mocks.loading, error: mocks.coursesError }),
  uniqueFacultyCoursesByCourseId: (courses: unknown) => courses,
}));
vi.mock('@/components/ui/select', () => ({ Select: (props: SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} /> }));
vi.mock('@/components/faculty', () => ({
  FacultyPageShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  FacultyPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  FacultyPanel: ({ children, title }: { children: ReactNode; title: string }) => <section><h2>{title}</h2>{children}</section>,
  FacultyMetricChip: () => null,
  FacultyEmptyState: ({ title, description }: { title?: string; description?: string }) => <div><p>{title}</p><p>{description}</p></div>,
  FacultyErrorBanner: ({ message }: { message: string }) => <p>{message}</p>,
}));

afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
beforeEach(() => {
  vi.clearAllMocks();
  api = { get: mocks.get };
  vi.stubEnv('NEXT_PUBLIC_FACULTY_DEMO_MODE', 'false');
  mocks.courses = [teachingCourse];
  mocks.loading = false;
  mocks.coursesError = null;
  mocks.get.mockImplementation(async (path: string) => path.includes('/analytics') ? { health: {} } : []);
});

function courseSelect() {
  return screen.getByRole('combobox', { name: 'Course' });
}

function generateButton() {
  return screen.getByRole('button', { name: 'Generate report' });
}

function expectExportsUnavailable() {
  expect(screen.getByRole('button', { name: 'Download CSV' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Print preview' })).toBeDisabled();
}

describe('course report integrity', () => {
  it('discards an already generated report when switching accounts', async () => {
    const view = render(<FacultyReportsPage />);
    fireEvent.click(generateButton());
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith('CS101 report ready'));
    expect(screen.getByRole('button', { name: 'Download CSV' })).toBeEnabled();
    api = { get: vi.fn().mockResolvedValue([]) };
    view.rerender(<FacultyReportsPage />);
    expectExportsUnavailable();
    expect(screen.getByText('No report yet')).toBeInTheDocument();
  });

  it('ignores report responses still pending for a previous account', async () => {
    let finish!: (value: unknown[]) => void;
    const pending = new Promise<unknown[]>((resolve) => { finish = resolve; });
    mocks.get.mockReturnValue(pending);
    const view = render(<FacultyReportsPage />);
    fireEvent.click(generateButton());
    api = { get: vi.fn().mockResolvedValue([]) };
    view.rerender(<FacultyReportsPage />);
    await act(async () => { finish([]); });
    expectExportsUnavailable();
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it('does not offer an export or success when a required source fails', async () => {
    mocks.get.mockRejectedValue(new Error('Roster service unavailable'));
    render(<FacultyReportsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Generate report' }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Roster service unavailable'));
    expect(screen.getByRole('alert')).toHaveTextContent('Roster service unavailable');
    expect(mocks.success).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Download CSV' })).toBeDisabled();
  });

  it('clears an older preview when regeneration fails instead of exporting stale data', async () => {
    render(<FacultyReportsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Generate report' }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith('CS101 report ready'));
    expect(screen.getByRole('button', { name: 'Download CSV' })).not.toBeDisabled();
    mocks.get.mockRejectedValue(new Error('Roster unavailable'));
    fireEvent.click(screen.getByRole('button', { name: 'Generate report' }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Roster unavailable'));
    expect(screen.getByRole('alert')).toHaveTextContent('Roster unavailable');
    expect(screen.getByRole('button', { name: 'Download CSV' })).toBeDisabled();
  });
});

describe('report course availability', () => {
  it('shows loading ahead of a stale course error and blocks generation with stale options', () => {
    mocks.loading = true;
    mocks.coursesError = 'Previous course request failed';
    render(<FacultyReportsPage />);

    expect(screen.getByRole('option', { name: 'Loading courses…' })).toBeInTheDocument();
    expect(courseSelect()).toBeDisabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(generateButton()).toBeDisabled();
    expectExportsUnavailable();
    fireEvent.click(generateButton());
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it.each([null, 'No courses allocated to your timetable yet.'])(
    'shows a neutral empty state instead of an API failure (%s)',
    (error) => {
      mocks.courses = [];
      mocks.coursesError = error;
      render(<FacultyReportsPage />);

      expect(screen.getByRole('option', { name: 'No courses assigned' })).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('No teaching courses are assigned yet.');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(courseSelect()).toBeDisabled();
      expect(generateButton()).toBeDisabled();
      expectExportsUnavailable();
      fireEvent.click(generateButton());
      expect(mocks.get).not.toHaveBeenCalled();
    },
  );

  it('shows a genuine course error and blocks generation from retained course options', () => {
    mocks.coursesError = 'Course service unavailable';
    render(<FacultyReportsPage />);

    expect(screen.getByRole('option', { name: 'Unable to load courses' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Course service unavailable');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(courseSelect()).toBeDisabled();
    expect(generateButton()).toBeDisabled();
    expectExportsUnavailable();
    fireEvent.click(generateButton());
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('retains first-course selection and allows generation after courses finish loading', async () => {
    mocks.loading = true;
    const view = render(<FacultyReportsPage />);
    expect(generateButton()).toBeDisabled();

    mocks.loading = false;
    view.rerender(<FacultyReportsPage />);
    expect(courseSelect()).toHaveValue(teachingCourse.course_id);
    expect(generateButton()).toBeEnabled();
    fireEvent.click(generateButton());

    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith('CS101 report ready'));
    expect(screen.getByRole('button', { name: 'Download CSV' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Print preview' })).toBeEnabled();
    expect(mocks.get).toHaveBeenCalledWith('/api/academics/faculty/course/real-course/students');
  });

  it.each(['loading', 'error', 'empty'] as const)(
    'clears a generated preview and blocks exports when courses become %s',
    async (state) => {
      const view = render(<FacultyReportsPage />);
      fireEvent.click(generateButton());
      await waitFor(() => expect(mocks.success).toHaveBeenCalledWith('CS101 report ready'));
      expect(screen.getByRole('heading', { name: 'CS101 · Full course report' })).toBeInTheDocument();

      if (state === 'loading') mocks.loading = true;
      else if (state === 'error') mocks.coursesError = 'Course refresh failed';
      else mocks.courses = [];
      view.rerender(<FacultyReportsPage />);

      expect(screen.queryByRole('heading', { name: 'CS101 · Full course report' })).not.toBeInTheDocument();
      expect(generateButton()).toBeDisabled();
      expectExportsUnavailable();
    },
  );

  it('requires a new valid selection when the previously generated course leaves scope', async () => {
    const view = render(<FacultyReportsPage />);
    fireEvent.change(courseSelect(), { target: { value: teachingCourse.course_id } });
    fireEvent.click(generateButton());
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith('CS101 report ready'));

    mocks.courses = [{ ...teachingCourse, course_id: 'another-course', course_code: 'CS102' }];
    view.rerender(<FacultyReportsPage />);

    expect(courseSelect()).toBeEnabled();
    expect(generateButton()).toBeDisabled();
    expectExportsUnavailable();
    expect(screen.queryByRole('heading', { name: 'CS101 · Full course report' })).not.toBeInTheDocument();
    fireEvent.change(courseSelect(), { target: { value: 'another-course' } });
    expect(generateButton()).toBeEnabled();
  });

  it('ignores delayed report sources after the selected course leaves scope', async () => {
    let resolveRoster!: (rows: { name: string; attendance_percent: number }[]) => void;
    const delayedRoster = new Promise<{ name: string; attendance_percent: number }[]>((resolve) => {
      resolveRoster = resolve;
    });
    mocks.get.mockImplementation(async (path: string) => path.endsWith('/students')
      ? delayedRoster
      : path.includes('/analytics') ? { health: {} } : []);
    const view = render(<FacultyReportsPage />);
    fireEvent.click(generateButton());
    await screen.findByRole('button', { name: 'Generating…' });

    mocks.courses = [];
    view.rerender(<FacultyReportsPage />);
    await act(async () => { resolveRoster([{ name: 'Stale Student', attendance_percent: 80 }]); });

    expect(screen.queryByText('Stale Student')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'CS101 · Full course report' })).not.toBeInTheDocument();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
    expect(generateButton()).toBeDisabled();
    expectExportsUnavailable();
  });
});

describe('report attendance completeness', () => {
  const measuredAndUnknown = [
    { name: 'Unmeasured Student', roll_number: 'A001', attendance_percent: null, attendance_record_count: 0 },
    { name: 'Present Student', roll_number: 'A002', attendance_percent: 80, attendance_record_count: 5 },
    { name: 'Absent Student', roll_number: 'A003', attendance_percent: 0, attendance_record_count: 5 },
  ];

  it('keeps unrecorded attendance out of averages and risk while retaining measured zero', async () => {
    mocks.get.mockImplementation(async (path: string) => path.endsWith('/students') ? measuredAndUnknown : []);
    render(<FacultyReportsPage />);
    fireEvent.click(generateButton());

    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith('CS101 report ready'));
    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(screen.getByText('1 below 75%')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Not recorded' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '0.0%' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '80.0%' })).toBeInTheDocument();
  });

  it('excludes unrecorded attendance from the at-risk preview and exported CSV', async () => {
    let downloadedBlob: Blob | undefined;
    const OriginalURL = URL;
    class ExportURL extends OriginalURL {
      static createObjectURL = vi.fn((blob: Blob) => {
        downloadedBlob = blob;
        return 'blob:report-export';
      });
      static revokeObjectURL = vi.fn();
    }
    vi.stubGlobal('URL', ExportURL);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    mocks.get.mockImplementation(async (path: string) => path.endsWith('/students') ? measuredAndUnknown : []);
    render(<FacultyReportsPage />);
    fireEvent.click(screen.getByRole('button', { name: /At-risk students/ }));
    fireEvent.click(generateButton());

    await screen.findByRole('cell', { name: 'Absent Student' });
    expect(screen.queryByRole('cell', { name: 'Unmeasured Student' })).not.toBeInTheDocument();
    expect(screen.queryByRole('cell', { name: 'Present Student' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));

    expect(downloadedBlob).toBeInstanceOf(Blob);
    const csv = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(downloadedBlob!);
    });
    expect(csv).toContain('Absent Student,A003,0,HIGH');
    expect(csv).not.toContain('Unmeasured Student');
    expect(csv).not.toContain('Present Student');
  });

  it('shows an unavailable average instead of a healthy zero when no attendance has been recorded', async () => {
    mocks.get.mockImplementation(async (path: string) => path.endsWith('/students') ? [
      { name: 'Null Attendance', attendance_percent: null, attendance_record_count: 0 },
      { name: 'Missing Attendance', attendance_record_count: 0 },
    ] : []);
    render(<FacultyReportsPage />);
    fireEvent.click(generateButton());

    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith('CS101 report ready'));
    expect(screen.getByText('N/A')).toBeInTheDocument();
    expect(screen.getAllByRole('cell', { name: 'Not recorded' })).toHaveLength(2);
    expect(screen.queryByText('Attendance healthy')).not.toBeInTheDocument();
    expect(screen.queryByText(/^[1-9]\d* below 75%$/)).not.toBeInTheDocument();
  });
});
