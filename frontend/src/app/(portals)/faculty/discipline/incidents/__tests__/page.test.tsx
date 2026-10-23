import type { ReactNode, SelectHTMLAttributes } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FacultyDisciplineIncidentsPage from '../page';

const mocks = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn() },
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/lib/api', () => ({ useAuthedApi: () => mocks.api }));
vi.mock('@/lib/notifications/falcon-toast', () => ({
  toast: { success: mocks.success, error: mocks.error },
}));
vi.mock('@/lib/faculty-demo-mode', () => ({
  isEmptyArray: (value: unknown) => Array.isArray(value) && value.length === 0,
  isFacultyDemoModeEnabled: () => false,
  isFacultyDemoSmokeId: () => false,
  withFacultyDemoFallback: (live: unknown) => live,
}));
vi.mock('@/components/ui/select', () => ({
  Select: (props: SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} />,
}));
vi.mock('@/components/faculty', () => ({
  FacultyPageShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  FacultyPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  FacultyPageLoading: ({ label }: { label: string }) => <p>{label}</p>,
  FacultyEmptyState: ({ description }: { description: string }) => <p>{description}</p>,
}));

const students = [
  {
    user_id: 'a1234567-1234-4123-8123-123456789abc',
    name: 'Riya Test',
    enrollment_number: 'SGVU-2026-1004',
    official_email: 'riya@example.test',
  },
  {
    user_id: 'b1234567-1234-4123-8123-123456789abc',
    name: 'Arjun Test',
    enrollment_number: null,
    official_email: 'arjun@example.test',
  },
];
const courseId = 'c1234567-1234-4123-8123-123456789abc';
const mismatchMessage = 'This enrollment or email does not match the selected student. Correct it or select another student.';

async function openForm() {
  render(<FacultyDisciplineIncidentsPage />);
  const student = await screen.findByLabelText('Student');
  const reference = screen.getByLabelText('Enrollment / email');
  return { student, reference };
}

function fillIncidentDetails() {
  const course = screen.getByRole('option', { name: 'CS101 — Test course' }).closest('select')!;
  fireEvent.change(course, { target: { value: courseId } });
  fireEvent.change(screen.getByPlaceholderText('Describe the incident in detail'), {
    target: { value: 'A synthetic description used only in this mocked test.' },
  });
}

describe('discipline report student selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.api.get.mockImplementation(async (path: string) => {
      if (path === '/api/demerits/form-options') {
        return {
          students,
          courses: [{ course_id: courseId, course_code: 'CS101', course_name: 'Test course' }],
          categories: ['BEHAVIORAL'],
        };
      }
      return [];
    });
    mocks.api.post.mockResolvedValue({});
  });
  afterEach(cleanup);

  it.each(['student', 'subject', 'description'])(
    'keeps submission disabled until the required %s is supplied', async (field) => {
      const { student } = await openForm();
      const submit = screen.getByRole('button', { name: 'Submit to Disciplinary Committee' });
      expect(submit).toBeDisabled();
      if (field !== 'student') fireEvent.change(student, { target: { value: students[0].user_id } });
      if (field !== 'subject') {
        fireEvent.change(screen.getByRole('option', { name: 'CS101 — Test course' }).closest('select')!, { target: { value: courseId } });
      }
      fireEvent.change(screen.getByPlaceholderText('Describe the incident in detail'), {
        target: { value: field === 'description' ? '   ' : 'Mock incident description' },
      });
      expect(submit).toBeDisabled();
      fireEvent.click(submit);
      expect(mocks.api.post).not.toHaveBeenCalled();

      fireEvent.change(student, { target: { value: students[0].user_id } });
      fillIncidentDetails();
      expect(submit).toBeEnabled();
    },
  );

  it('keeps student and course options available when only history fails', async () => {
    const original = mocks.api.get.getMockImplementation()!;
    mocks.api.get.mockImplementation((path: string) => path.endsWith('/history')
      ? Promise.reject(new Error('History offline')) : original(path));
    const { student } = await openForm();
    fireEvent.change(student, { target: { value: students[0].user_id } });
    expect(student).toHaveDisplayValue('Riya Test · SGVU-2026-1004');
    expect(screen.getByRole('option', { name: 'CS101 — Test course' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load submitted incidents');
    expect(screen.queryByText('No incidents submitted yet.')).not.toBeInTheDocument();
  });

  it('uses the authenticated upload API and blocks a submission while evidence uploads', async () => {
    await openForm();
    let finish!: (value: { url: string }) => void;
    mocks.api.post.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const upload = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(upload, { target: { files: [new File(['test'], 'evidence.pdf', { type: 'application/pdf' })] } });
    await waitFor(() => expect(mocks.api.post).toHaveBeenCalledWith('/api/uploads/single', expect.any(FormData)));
    expect(upload).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Submit to Disciplinary Committee' })).toBeDisabled();
    finish({ url: '/uploads/test-evidence.pdf' });
    await waitFor(() => expect(upload).not.toBeDisabled());
  });

  it('rejects fractional demerit points without submitting an incident', async () => {
    const { student } = await openForm();
    fireEvent.change(student, { target: { value: students[0].user_id } });
    fillIncidentDetails();
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '1.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit to Disciplinary Committee' }));
    expect(mocks.error).toHaveBeenCalledWith('Points must be a whole number from 1 to 6');
    expect(mocks.api.post).not.toHaveBeenCalled();
  });

  it('fills the linked enrollment or email when selecting or changing students', async () => {
    const { student, reference } = await openForm();
    expect(student).toHaveAttribute('id', 'incident-student');
    expect(reference).toHaveAttribute('id', 'incident-student-reference');

    fireEvent.change(student, { target: { value: students[0].user_id } });
    expect(reference).toHaveValue(students[0].enrollment_number);

    fireEvent.change(reference, { target: { value: 'unfinished' } });
    fireEvent.change(student, { target: { value: students[1].user_id } });
    expect(reference).toHaveValue(students[1].official_email);
    expect(student).toHaveDisplayValue('Arjun Test');
    expect(screen.queryByText(mismatchMessage)).not.toBeInTheDocument();
  });

  it('retains the selected student while focusing, editing, and clearing the identifier', async () => {
    const { student, reference } = await openForm();
    fireEvent.change(student, { target: { value: students[0].user_id } });

    fireEvent.focus(reference);
    expect(student).toHaveValue(students[0].user_id);
    fireEvent.change(reference, { target: { value: 'SGVU-2026-' } });
    expect(student).toHaveValue(students[0].user_id);
    fireEvent.change(reference, { target: { value: '' } });
    expect(student).toHaveValue(students[0].user_id);
    expect(screen.queryByText(mismatchMessage)).not.toBeInTheDocument();
  });

  it('matches complete enrollment, email, and UUID identifiers without case sensitivity', async () => {
    const { student, reference } = await openForm();
    const identifiers = [
      { reference: '  sgvu-2026-1004  ', student: students[0] },
      { reference: 'ARJUN@EXAMPLE.TEST', student: students[1] },
      { reference: students[0].user_id.toUpperCase(), student: students[0] },
    ];
    for (const match of identifiers) {
      fireEvent.change(reference, { target: { value: match.reference } });
      expect(student).toHaveValue(match.student.user_id);
      expect(screen.queryByText(mismatchMessage)).not.toBeInTheDocument();
    }
  });

  it('shows a conflict without removing the selected name and blocks submission', async () => {
    const { student, reference } = await openForm();
    fireEvent.change(student, { target: { value: students[0].user_id } });
    fireEvent.change(reference, { target: { value: 'someone-else@example.test' } });
    fillIncidentDetails();

    expect(student).toHaveValue(students[0].user_id);
    expect(screen.getByText(mismatchMessage)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit to Disciplinary Committee' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Submit to Disciplinary Committee' }));
    expect(mocks.api.post).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it('uses the selected student UUID when a cleared identifier is submitted', async () => {
    const { student, reference } = await openForm();
    fireEvent.change(student, { target: { value: students[0].user_id } });
    fireEvent.change(reference, { target: { value: '' } });
    fillIncidentDetails();
    fireEvent.click(screen.getByRole('button', { name: 'Submit to Disciplinary Committee' }));

    await waitFor(() => expect(mocks.api.post).toHaveBeenCalledWith(
      '/api/demerits/submit',
      expect.objectContaining({ student_id: students[0].user_id, subject_id: courseId }),
    ));
    await waitFor(() => expect(mocks.success).toHaveBeenCalled());
  });
});
