import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AnalyticsPage from '@/app/(portals)/exam-cell/analytics/page';

const { api, auth } = vi.hoisted(() => {
  const api = { get: vi.fn() };
  return { api, auth: { api } };
});
vi.mock('@/lib/api', () => ({ useAuthedApi: () => auth.api }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: { error: vi.fn() } }));

type Subject = { subject_code: string; subject_name: string; avg_marks: number; students: number };
const analytics = (semester: number, subject_name: string, subjects?: Subject[]) => ({
  semester, grade_distribution: [], faculty_performance: [], pass_fail: [],
  subject_analysis: subjects ?? [{ subject_code: `SYN-${semester}`, subject_name, avg_marks: 47, students: 2 }],
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

let downloads: string[];
let blobs: Blob[];
beforeEach(() => {
  auth.api = api;
  api.get.mockReset();
  downloads = [];
  blobs = [];
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL(blob: Blob) { blobs.push(blob); return 'blob:synthetic-analytics'; }
    static revokeObjectURL = vi.fn();
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { downloads.push(this.download); });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Examination analytics request ownership and exports', () => {
  it('labels the semester input and disables exports until the initial response succeeds', async () => {
    const initial = deferred<ReturnType<typeof analytics>>();
    api.get.mockReturnValue(initial.promise);
    render(<AnalyticsPage />);
    expect(screen.getByLabelText('Semester')).toHaveValue(4);
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
    await act(async () => initial.resolve(analytics(4, 'Synthetic current subject')));
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeEnabled();
  });

  it('hides old semester data and blocks export during loading and failure, then retries the current semester', async () => {
    const next = deferred<ReturnType<typeof analytics>>();
    api.get.mockResolvedValueOnce(analytics(4, 'Old synthetic subject')).mockReturnValueOnce(next.promise)
      .mockResolvedValueOnce(analytics(5, 'Current synthetic subject'));
    render(<AnalyticsPage />);
    await screen.findByText('Old synthetic subject');
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '5' } });
    const exportButton = screen.getByRole('button', { name: 'Export CSV' });
    expect(exportButton).toBeDisabled();
    expect(screen.queryByText('Old synthetic subject')).toBeNull();
    fireEvent.click(exportButton);
    expect(blobs).toHaveLength(0);
    await act(async () => next.reject(new Error('Synthetic analytics unavailable')));
    expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic analytics unavailable');
    expect(exportButton).toBeDisabled();
    expect(screen.queryByText('No subject result data.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry analytics' }));
    await screen.findByText('Current synthetic subject');
    fireEvent.click(exportButton);
    expect(downloads).toEqual(['exam-analytics-sem5.csv']);
    expect(await readBlob(blobs[0])).toContain('Current synthetic subject');
    expect(await readBlob(blobs[0])).not.toContain('Old synthetic subject');
    expect(api.get).toHaveBeenLastCalledWith('/api/exam-cell/analytics/advanced?semester=5');
  });

  it('ignores an older semester response after a newer semester has loaded', async () => {
    const old = deferred<ReturnType<typeof analytics>>();
    api.get.mockReturnValueOnce(old.promise).mockResolvedValueOnce(analytics(8, 'Current semester eight'));
    render(<AnalyticsPage />);
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '8' } });
    await screen.findByText('Current semester eight');
    await act(async () => old.resolve(analytics(4, 'Late old semester four')));
    expect(screen.queryByText('Late old semester four')).toBeNull();
    expect(screen.getByText('Current semester eight')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(downloads).toEqual(['exam-analytics-sem8.csv']);
    expect(await readBlob(blobs[0])).toContain('Current semester eight');
  });

  it('does not reactivate an earlier response when switching back before the next semester finishes', async () => {
    const nextSemester = deferred<ReturnType<typeof analytics>>();
    const refreshedOriginal = deferred<ReturnType<typeof analytics>>();
    api.get.mockResolvedValueOnce(analytics(4, 'Original synthetic subject'))
      .mockReturnValueOnce(nextSemester.promise).mockReturnValueOnce(refreshedOriginal.promise);
    render(<AnalyticsPage />);
    await screen.findByText('Original synthetic subject');
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '5' } });
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '4' } });
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
    expect(screen.queryByText('Original synthetic subject')).toBeNull();
    await act(async () => nextSemester.resolve(analytics(5, 'Late synthetic semester five')));
    expect(screen.queryByText('Late synthetic semester five')).toBeNull();
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
    await act(async () => refreshedOriginal.resolve(analytics(4, 'Refreshed synthetic subject')));
    await screen.findByText('Refreshed synthetic subject');
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeEnabled();
  });

  it('hides data and blocks exports when the authenticated API changes', async () => {
    api.get.mockResolvedValue(analytics(4, 'Previous session subject'));
    const { rerender } = render(<AnalyticsPage />);
    await screen.findByText('Previous session subject');
    const next = deferred<ReturnType<typeof analytics>>();
    auth.api = { get: vi.fn().mockReturnValue(next.promise) };
    rerender(<AnalyticsPage />);
    expect(screen.queryByText('Previous session subject')).toBeNull();
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
    await act(async () => next.resolve(analytics(4, 'Current session subject')));
    await screen.findByText('Current session subject');
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeEnabled();
  });

  it('quotes commas, quotes and line breaks and protects formula-like text while retaining numeric values', async () => {
    api.get.mockResolvedValue(analytics(4, '', [
      { subject_code: 'SYN,"Q"', subject_name: 'Synthetic "quoted", subject\nsecond line', avg_marks: 47.25, students: 2 },
      { subject_code: '=1+1', subject_name: ' +SUM(A1:A2)', avg_marks: -1.5, students: 0 },
      { subject_code: '-synthetic', subject_name: '@SUM(1,2)', avg_marks: 0, students: 3 },
      { subject_code: '\t=1', subject_name: '\n=2', avg_marks: 10, students: 4 },
    ]));
    render(<AnalyticsPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Export CSV' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(await readBlob(blobs[0])).toBe([
      'Code,Name,Avg Marks,Students',
      '"SYN,""Q""","Synthetic ""quoted"", subject\nsecond line",47.25,2',
      '"\'=1+1","\' +SUM(A1:A2)",-1.5,0',
      '"\'-synthetic","\'@SUM(1,2)",0,3',
      '"\'\t=1","\'\n=2",10,4',
    ].join('\n'));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:synthetic-analytics');
  });
});
