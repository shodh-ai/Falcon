import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import CourseGradesPage from '@/app/(portals)/exam-cell/course-grades/page';
import UfmPage from '@/app/(portals)/exam-cell/ufm-cases/page';

const { api, auth, toast } = vi.hoisted(() => {
  const api = { get: vi.fn(), post: vi.fn() };
  return { api, auth: { api }, toast: { error: vi.fn(), success: vi.fn() } };
});
vi.mock('@/lib/api', () => ({ useAuthedApi: () => auth.api }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast }));
vi.mock('@/components/ui/select', () => ({ Select: (props: ComponentProps<'select'>) => <select {...props} /> }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

const course = (id: string) => ({ course_id: id, course_code: id, course_name: `Synthetic ${id}` });
const grade = (name: string) => ({ student_id: name, student_name: name, quiz_marks: 9, internal_marks: 8, mid_term_marks: 25, end_term_marks: 45, aggregate: 87, grade: 'A' });
const options = (id: string) => ({ students: [{ user_id: id, name: `Student ${id}`, official_email: `${id}@example.test`, enrollment_number: id }], courses: [course(id)], departments: ['Synthetic department'] });
const ufmCase = (name: string) => ({ case_id: name, student_name: name, description: 'Synthetic incident', penalty_applied: 'Synthetic penalty', status: 'OPEN', marks_locked: true, logged_at: '2026-10-21T09:00:00Z' });

beforeEach(() => { auth.api = api; api.get.mockReset(); api.post.mockReset(); toast.error.mockReset(); toast.success.mockReset(); });

describe('Course Grades request lifecycle', () => {
  it('distinguishes course load failure from an empty semester and retries', async () => {
    api.get.mockRejectedValueOnce(new Error('Synthetic course failure')).mockResolvedValueOnce([]);
    render(<CourseGradesPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic course failure');
    expect(screen.queryByText('No courses are available for this semester.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry courses' }));
    expect(await screen.findByText('No courses are available for this semester.')).toBeTruthy();
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('distinguishes aggregate failure from an empty course and retries', async () => {
    let failGrades = true;
    api.get.mockImplementation((path: string) => path.includes('/courses?') ? Promise.resolve([course('one')]) : failGrades ? Promise.reject(new Error('Synthetic marks failure')) : Promise.resolve([]));
    render(<CourseGradesPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic marks failure');
    expect(screen.queryByText('No students enrolled in this course for this semester.')).toBeNull();
    failGrades = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry grades' }));
    expect(await screen.findByText('No students enrolled in this course for this semester.')).toBeTruthy();
  });

  it('ignores a superseded semester course response', async () => {
    const old = deferred<object[]>();
    api.get.mockImplementation((path: string) => path.includes('/courses?semester=4') ? old.promise : path.includes('/courses?semester=5') ? Promise.resolve([course('new')]) : Promise.resolve([grade('Current semester student')]));
    render(<CourseGradesPage />);
    fireEvent.change(screen.getByLabelText('Grades semester'), { target: { value: '5' } });
    await screen.findByText('Current semester student');
    await act(async () => old.resolve([course('old')]));
    expect(screen.queryByRole('option', { name: 'old — Synthetic old' })).toBeNull();
    expect(screen.getByLabelText('Grades course')).toHaveValue('new');
    expect(api.get.mock.calls.some(([path]) => String(path).includes('course_id=old'))).toBe(false);
  });

  it('ignores a superseded course marks response', async () => {
    const old = deferred<object[]>();
    api.get.mockImplementation((path: string) => path.includes('/courses?') ? Promise.resolve([course('old'), course('new')]) : path.includes('course_id=old') ? old.promise : Promise.resolve([grade('Current course student')]));
    render(<CourseGradesPage />);
    await screen.findByRole('option', { name: 'old — Synthetic old' });
    fireEvent.change(screen.getByLabelText('Grades course'), { target: { value: 'new' } });
    await screen.findByText('Current course student');
    await act(async () => old.resolve([grade('Stale course student')]));
    expect(screen.queryByText('Stale course student')).toBeNull();
    expect(screen.getByText('Current course student')).toBeTruthy();
  });

  it('hides old marks immediately when the next semester fails to load', async () => {
    const next = deferred<object[]>();
    api.get.mockImplementation((path: string) => path.includes('/courses?semester=4') ? Promise.resolve([course('one')]) : path.includes('/courses?semester=5') ? next.promise : Promise.resolve([grade('Previous semester student')]));
    render(<CourseGradesPage />);
    await screen.findByText('Previous semester student');
    fireEvent.change(screen.getByLabelText('Grades semester'), { target: { value: '5' } });
    expect(screen.queryByText('Previous semester student')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Loading courses');
    await act(async () => next.reject(new Error('Synthetic next semester failure')));
    expect(screen.getByRole('alert')).toHaveTextContent('Synthetic next semester failure');
    expect(screen.queryByText('Previous semester student')).toBeNull();
  });

  it('clears displayed records when the authenticated API session changes', async () => {
    api.get.mockImplementation((path: string) => Promise.resolve(path.includes('/courses?') ? [course('one')] : [grade('Previous authenticated student')]));
    const { rerender } = render(<CourseGradesPage />);
    await screen.findByText('Previous authenticated student');
    const pending = deferred<object[]>();
    auth.api = { get: vi.fn().mockReturnValue(pending.promise), post: vi.fn() };
    rerender(<CourseGradesPage />);
    expect(screen.queryByText('Previous authenticated student')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Loading courses');
    await act(async () => pending.resolve([]));
    expect(screen.getByText('No courses are available for this semester.')).toBeTruthy();
  });
});

describe('UFM request and submission lifecycle', () => {
  it('shows form-options failure, prevents submission and retries the real request', async () => {
    let failed = true;
    api.get.mockImplementation((path: string) => path.includes('form-options') ? failed ? Promise.reject(new Error('Synthetic roster failure')) : Promise.resolve(options('new')) : Promise.resolve([]));
    render(<UfmPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic roster failure');
    expect(screen.getByRole('button', { name: 'Log UFM & trigger auto-penalties' })).toBeDisabled();
    failed = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry form options' }));
    expect(await screen.findByRole('option', { name: 'Student new · new' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Log UFM & trigger auto-penalties' })).toBeEnabled();
  });

  it('distinguishes case-history failure from an empty period and retries', async () => {
    let failed = true;
    api.get.mockImplementation((path: string) => path.includes('form-options') ? Promise.resolve(options('one')) : failed ? Promise.reject(new Error('Synthetic history failure')) : Promise.resolve([]));
    render(<UfmPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic history failure');
    expect(screen.queryByText('No UFM cases in this period.')).toBeNull();
    failed = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry case history' }));
    expect(await screen.findByText('No UFM cases in this period.')).toBeTruthy();
  });

  it('ignores superseded case-history and roster responses', async () => {
    const oldCases = deferred<object[]>();
    const oldOptions = deferred<ReturnType<typeof options>>();
    api.get.mockImplementation((path: string) => path.includes('form-options?semester=4') ? oldOptions.promise : path.includes('form-options?semester=5') ? Promise.resolve(options('current')) : path.includes('month=1') ? Promise.resolve([ufmCase('Current history student')]) : oldCases.promise);
    render(<UfmPage />);
    fireEvent.change(screen.getByLabelText('UFM semester'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('UFM history period'), { target: { value: '1' } });
    await screen.findByText('Current history student');
    await screen.findByRole('option', { name: 'Student current · current' });
    await act(async () => { oldCases.resolve([ufmCase('Stale history student')]); oldOptions.resolve(options('stale')); });
    expect(screen.queryByText('Stale history student')).toBeNull();
    expect(screen.queryByRole('option', { name: 'Student stale · stale' })).toBeNull();
  });

  it('submits once while pending and preserves course scope and form on failure', async () => {
    const pending = deferred<object>();
    api.get.mockImplementation((path: string) => Promise.resolve(path.includes('form-options') ? options('one') : []));
    api.post.mockReturnValueOnce(pending.promise).mockResolvedValueOnce({ case_id: 'synthetic-case' });
    render(<UfmPage />);
    await screen.findByRole('option', { name: 'Student one · one' });
    fireEvent.change(screen.getByLabelText('UFM student'), { target: { value: 'one' } });
    fireEvent.change(screen.getByLabelText('UFM course scope'), { target: { value: 'one' } });
    fireEvent.change(screen.getByLabelText('UFM incident description'), { target: { value: 'Synthetic incident details' } });
    const submit = screen.getByRole('button', { name: 'Log UFM & trigger auto-penalties' });
    await act(async () => { fireEvent.click(submit); fireEvent.click(submit); });
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/api/exam-cell/ufm-cases', expect.objectContaining({ student_user_id: 'one', course_id: 'one', description: 'Synthetic incident details' }));
    expect(toast.success).not.toHaveBeenCalled();
    await act(async () => pending.reject(new Error('Synthetic save failure')));
    expect(screen.getByLabelText('UFM incident description')).toHaveValue('Synthetic incident details');
    expect(screen.getByLabelText('UFM course scope')).toHaveValue('one');
    fireEvent.click(screen.getByRole('button', { name: 'Log UFM & trigger auto-penalties' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
  });
});
