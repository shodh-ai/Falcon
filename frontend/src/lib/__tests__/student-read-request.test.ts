import { afterEach, describe, expect, it, vi } from 'vitest';
import { withStudentReadTimeout } from '@/lib/student-read-request';

describe('Student read deadlines', () => {
  afterEach(() => vi.useRealTimers());
  it('rejects an unresponsive read so the page can offer a retry', async () => {
    vi.useFakeTimers();
    const request = withStudentReadTimeout(new Promise(() => {}), 100);
    const assertion = expect(request).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
  });
  it('clears the deadline after success or a service error', async () => {
    vi.useFakeTimers();
    await expect(withStudentReadTimeout(Promise.resolve({ cgpa: 8 }))).resolves.toEqual({ cgpa: 8 });
    await expect(withStudentReadTimeout(Promise.reject(new Error('Forbidden')))).rejects.toThrow('Forbidden');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('handles a late rejection after the deadline', async () => {
    vi.useFakeTimers();
    let rejectRead!: (error: Error) => void;
    const request = withStudentReadTimeout(new Promise((_, reject) => { rejectRead = reject; }), 100);
    const assertion = expect(request).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    rejectRead(new Error('late service failure'));
    await Promise.resolve();
    expect(vi.getTimerCount()).toBe(0);
  });
});
