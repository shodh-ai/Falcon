import type { SelectHTMLAttributes } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FacultyGradingPage from '@/app/(portals)/faculty/grading/page';

const { api, toast, courses } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  courses: [{ course_id: 'course-real', course_code: 'SYNTH', course_name: 'Synthetic course' }],
}));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => api }));
vi.mock('@/components/faculty/useFacultyCourses', () => ({ useFacultyCourses: () => ({ courses, loading: false }) }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast }));
vi.mock('@/components/ui/select', () => ({ Select: (props: SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} /> }));
vi.mock('@/lib/faculty-demo-mode', () => ({ isFacultyDemoEntityId: () => false, isEmptyArray: (v: unknown[]) => !v.length, withFacultyDemoFallback: (v: unknown) => v }));
const rows = (status = 'DRAFT') => [{ student_user_id: 'student-real', name: 'Synthetic student', roll_number: 'SYN-1', marks: { GA1: { obtained: 3, status } } }];
beforeEach(() => {
  api.get.mockReset().mockResolvedValue(rows()); api.post.mockReset();
  toast.success.mockReset(); toast.error.mockReset(); toast.warning.mockReset();
  window.localStorage.clear();
});
async function open() {
  render(<FacultyGradingPage />);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'course-real' } });
  await screen.findByText('Synthetic student');
  return screen.getByRole('button', { name: 'Submit All Marks' });
}

describe('Faculty marks submission boundary', () => {
  it('stops submission when saving a component fails', async () => {
    api.post.mockRejectedValueOnce(new Error('Synthetic draft failure'));
    fireEvent.click(await open());
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Synthetic draft failure'));
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post.mock.calls[0][0]).toContain('/marks/draft');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('reports actual COE submission instead of claiming student publication', async () => {
    api.post.mockImplementation((path: string) => path.endsWith('/publish-all')
      ? Promise.resolve({ published: 0, submitted: 1, status: 'PENDING_COE', message: '1 marks submitted for Examination Cell review.' })
      : Promise.resolve({ saved: 1 }));
    fireEvent.click(await open());
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('1 marks submitted for Examination Cell review.'));
    expect(api.post.mock.calls.some(([path]) => String(path).endsWith('/publish-all'))).toBe(true);
    expect(toast.success.mock.calls.flat().some((message) => String(message).includes('Notifications sent'))).toBe(false);
  });

  it('locks already submitted marks and does not offer repeat publication', async () => {
    api.get.mockResolvedValue(rows('PENDING_COE'));
    const submit = await open();
    expect(submit).toBeDisabled();
    expect(screen.getByDisplayValue('3')).toBeDisabled();
  });

  it('prevents duplicate submission while the draft save is pending', async () => {
    api.post.mockReturnValue(new Promise(() => {}));
    const submit = await open();
    act(() => { fireEvent.click(submit); fireEvent.click(submit); });
    expect(api.post).toHaveBeenCalledTimes(1);
  });
});
