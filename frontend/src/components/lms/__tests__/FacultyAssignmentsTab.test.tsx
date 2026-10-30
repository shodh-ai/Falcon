import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FacultyAssignmentsTab } from '@/components/lms/FacultyAssignmentsTab';

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  postMultipart: vi.fn(),
  patchMultipart: vi.fn(),
  downloadWithAuth: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  pathname: null as string | null,
  apiPost: vi.fn(),
}));

vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname }));
vi.mock('@/lib/api', () => {
  const api = { get: mocks.apiGet, post: mocks.apiPost };
  return { useAuthedApi: () => api };
});

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: 'faculty-test-token' }),
}));

vi.mock('@/lib/api/lms', () => ({
  postMultipart: mocks.postMultipart,
  patchMultipart: mocks.patchMultipart,
  downloadWithAuth: mocks.downloadWithAuth,
}));

vi.mock('@/lib/notifications/falcon-toast', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

describe('FacultyAssignmentsTab create modal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = null;
    mocks.apiGet.mockResolvedValue([]);
    mocks.postMultipart.mockResolvedValue({ notified_count: 0 });
  });

  it('loads only personal assignments within HOD My Teaching', async () => {
    mocks.pathname = '/hod/my-teaching/courses/course-1';
    render(<FacultyAssignmentsTab courseId="course-1" />);
    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('/api/academics/faculty/assignments?courseId=course-1&scope=mine'));
  });

  it('keeps the modal bounded and scrollable so publish and cancel remain reachable', async () => {
    render(<FacultyAssignmentsTab courseId="course-1" />);
    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('/api/academics/faculty/assignments?courseId=course-1'));

    fireEvent.click(screen.getByRole('button', { name: /create da/i }));

    const dialog = screen.getByRole('dialog', { name: /create digital assignment/i });
    const form = dialog.querySelector('form');
    const publish = screen.getByRole('button', { name: 'Publish Assignment' });
    const cancel = screen.getByRole('button', { name: 'Cancel' });

    expect(dialog.className).toContain('max-h-[calc(100dvh-2rem)]');
    expect(form?.className).toContain('overflow-y-auto');
    expect(publish).toBeEnabled();
    expect(cancel).toBeEnabled();

    fireEvent.click(cancel);
    expect(screen.queryByRole('dialog', { name: /create digital assignment/i })).not.toBeInTheDocument();
  });

  it('submits the assignment from the modal action button', async () => {
    render(<FacultyAssignmentsTab courseId="course-1" />);
    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /create da/i }));

    fireEvent.change(screen.getByPlaceholderText('e.g. Linked List Implementation'), {
      target: { value: 'Viewport regression assignment' },
    });
    const dateInputs = screen.getByRole('dialog', { name: /create digital assignment/i }).querySelectorAll(
      'input[type="datetime-local"]',
    );
    fireEvent.change(dateInputs[1], {
      target: { value: '2099-01-01T10:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Publish Assignment' }));

    await waitFor(() => expect(mocks.postMultipart).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog', { name: /create digital assignment/i })).not.toBeInTheDocument();
  });
});
