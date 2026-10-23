import type { SelectHTMLAttributes } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FacultyInvigilationPage from '../page';

const fixtures = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn() },
}));
const legacyExamDate = '2026-10-23T23:30:00-07:00';
const duty = {
  assignment_id: 'duty-1', exam_date: legacyExamDate, block_name: 'A', room: '101', session_label: 'Morning duty', excuse_status: null, excuse_reason: null, exam_cell_comment: null,
};
const incomingSwap = {
  swap_id: 'swap-1', assignment_id: 'duty-1', requester_faculty_user_id: 'peer-faculty', target_faculty_user_id: 'current-faculty', reason: 'Schedule conflict', status: 'PENDING_TARGET', target_comment: null, exam_cell_comment: null, exam_date: legacyExamDate, room: '201', session_label: 'Morning duty', requester_name: 'Peer Faculty', target_name: 'Current Faculty',
};

vi.mock('@/lib/api', () => ({ useAuthedApi: () => fixtures.api }));
vi.mock('@/components/ui/select', () => ({ Select: (props: SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} /> }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { user_id: 'current-faculty' } }) }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: fixtures.toast }));
vi.mock('@/lib/faculty-demo-mode', () => ({
  withFacultyDemoFallback: (live: unknown) => live,
  isEmptyArray: (value: unknown) => Array.isArray(value) && value.length === 0,
  isFacultyDemoSmokeId: () => false,
}));

beforeEach(() => {
  vi.clearAllMocks();
  fixtures.api = { get: vi.fn(), post: vi.fn() };
  fixtures.api.get.mockImplementation(async (path: string) => path.endsWith('/invigilation-swaps')
    ? [incomingSwap]
    : path.endsWith('/swap-partners') ? [] : [duty]);
  fixtures.api.post.mockReset();
});

describe('exam duty request safeguards', () => {
  it('prevents repeated unavailability requests and retains the reason after failure', async () => {
    let fail!: (error: Error) => void;
    fixtures.api.post.mockReturnValue(new Promise((_, reject) => { fail = reject; }));
    render(<FacultyInvigilationPage />);
    await screen.findByText('Morning duty');
    fireEvent.click(screen.getByRole('button', { name: 'Request Unavailability' }));
    const reason = screen.getByPlaceholderText(/Medical emergency/);
    fireEvent.change(reason, { target: { value: 'Schedule conflict' } });
    const submit = screen.getByRole('button', { name: 'Submit Request' });
    act(() => { fireEvent.click(submit); fireEvent.click(submit); });
    expect(fixtures.api.post).toHaveBeenCalledExactlyOnceWith(
      '/api/academics/faculty/workspaces/invigilation/duty-1/excuse', { reason: 'Schedule conflict' },
    );
    expect(reason).toBeDisabled();
    await act(async () => { fail(new Error('Save offline')); });
    expect(fixtures.toast.error).toHaveBeenCalledWith('Save offline');
    expect(reason).toHaveValue('Schedule conflict');
    expect(submit).toBeEnabled();
  });

  it('does not refresh or report an old account request after switching accounts', async () => {
    let finish!: (value: object) => void;
    const previous = fixtures.api;
    previous.post.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const view = render(<FacultyInvigilationPage />);
    await screen.findByText('Morning duty');
    fireEvent.click(screen.getByRole('button', { name: 'Request Unavailability' }));
    fireEvent.change(screen.getByPlaceholderText(/Medical emergency/), { target: { value: 'Schedule conflict' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Request' }));
    fixtures.api = { get: vi.fn().mockResolvedValue([]), post: vi.fn() };
    view.rerender(<FacultyInvigilationPage />);
    await act(async () => { finish({}); });
    expect(previous.get).toHaveBeenCalledTimes(2);
    expect(fixtures.toast.success).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Morning duty')).not.toBeInTheDocument();
  });

  it('shows a partner read failure and retries without creating a swap', async () => {
    fixtures.api.get.mockImplementation(async (path: string) => {
      if (path.endsWith('/swap-partners')) throw new Error('Partners offline');
      return path.endsWith('/invigilation-swaps') ? [] : [duty];
    });
    render(<FacultyInvigilationPage />);
    await screen.findByText('Morning duty');
    fireEvent.click(screen.getByRole('button', { name: 'Request Swap' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Partners offline');
    expect(screen.getByRole('button', { name: 'Send request' })).toBeDisabled();
    fixtures.api.get.mockResolvedValue([{ user_id: 'peer-1', name: 'Available Peer' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Retry partners' }));
    await screen.findByRole('option', { name: 'Available Peer' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(fixtures.api.post).not.toHaveBeenCalled();
  });
});
afterEach(cleanup);

describe('exam duty calendar dates', () => {
  it('shows the same calendar date in the duty roster, incoming swap and swap history', async () => {
    render(<FacultyInvigilationPage />);
    await screen.findByText('Morning duty', { exact: true });

    expect(screen.getByText('23 Oct 2026', { exact: true })).toBeInTheDocument();
    expect(screen.getAllByText(/23 Oct 2026 · Room 201/)).toHaveLength(2);
    expect(screen.queryByText(/24 Oct 2026/)).not.toBeInTheDocument();
    expect(fixtures.api.post).not.toHaveBeenCalled();
  });

  it('uses the same calendar date when opening swap and response dialogs without submitting', async () => {
    render(<FacultyInvigilationPage />);
    await screen.findByText('Morning duty', { exact: true });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Request Swap' })); });
    expect(screen.getByRole('dialog')).toHaveTextContent('23 Oct 2026');
    expect(screen.getByRole('dialog')).not.toHaveTextContent('24 Oct 2026');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Respond' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('23 Oct 2026');
    expect(fixtures.api.post).not.toHaveBeenCalled();
  });

  it('retains historical duties and labels invalid dates rather than inventing a date', async () => {
    fixtures.api.get.mockImplementation(async (path: string) => path.endsWith('/invigilation-swaps') ? [] : [
      { ...duty, assignment_id: 'history-duty', exam_date: '2020-01-01', session_label: 'Historical duty' },
      { ...duty, assignment_id: 'invalid-duty', exam_date: '2026-02-30', session_label: 'Invalid date duty' },
    ]);
    render(<FacultyInvigilationPage />);

    await screen.findByText('Historical duty');
    expect(screen.getByText('01 Jan 2020')).toBeInTheDocument();
    expect(screen.getByText('Invalid date duty')).toBeInTheDocument();
    expect(screen.getByText('Date unavailable')).toBeInTheDocument();
    expect(fixtures.api.post).not.toHaveBeenCalled();
  });

  it.each([
    ['Block A', 'Block A · Room 101'],
    ['A', 'Block A · Room 101'],
    [null, '— · Room 101'],
  ])('shows block %j without duplicating its prefix', async (blockName, expected) => {
    fixtures.api.get.mockImplementation(async (path: string) => path.endsWith('/invigilation-swaps')
      ? [] : [{ ...duty, block_name: blockName }]);
    render(<FacultyInvigilationPage />);

    await screen.findByText('Morning duty');
    expect(screen.getByText(expected!, { exact: true })).toBeInTheDocument();
    expect(screen.queryByText(/Block Block/)).not.toBeInTheDocument();
  });
});

describe('independent exam duty reads', () => {
  it('shows loading before successful responses instead of a false empty roster', async () => {
    let resolveDuties!: (rows: typeof duty[]) => void;
    let resolveSwaps!: (rows: typeof incomingSwap[]) => void;
    const duties = new Promise<typeof duty[]>((resolve) => { resolveDuties = resolve; });
    const swaps = new Promise<typeof incomingSwap[]>((resolve) => { resolveSwaps = resolve; });
    fixtures.api.get.mockImplementation((path: string) => path.endsWith('/invigilation-swaps') ? swaps : duties);
    render(<FacultyInvigilationPage />);

    expect(screen.getByText('Loading exam duties…')).toBeInTheDocument();
    expect(screen.getByText('Loading duty swaps…')).toBeInTheDocument();
    expect(screen.queryByText('No invigilation duties assigned yet.')).not.toBeInTheDocument();
    await act(async () => { resolveDuties([duty]); });
    expect(screen.getByText('Morning duty')).toBeInTheDocument();
    expect(screen.getByText('Loading duty swaps…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request Swap' })).toBeDisabled();
    await act(async () => { resolveSwaps([]); });
    expect(screen.getByRole('button', { name: 'Request Swap' })).toBeEnabled();
    expect(fixtures.api.post).not.toHaveBeenCalled();
  });

  it('retains incoming swap data when duties fail and retries only the failed roster', async () => {
    fixtures.api.get.mockImplementation(async (path: string) => {
      if (path.endsWith('/invigilation-swaps')) return [incomingSwap];
      throw new Error('Duty roster unavailable');
    });
    render(<FacultyInvigilationPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Duty roster unavailable');
    expect(screen.getByText('Peer Faculty requests a swap')).toBeInTheDocument();
    expect(screen.queryByText('No invigilation duties assigned yet.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Respond' })).toBeDisabled();
    fixtures.api.get.mockResolvedValue([duty]);
    fireEvent.click(screen.getByRole('button', { name: 'Retry duties' }));

    await screen.findByText('Morning duty');
    expect(screen.getByRole('button', { name: 'Respond' })).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(fixtures.api.get.mock.calls.filter(([path]) => path.endsWith('/invigilation-swaps'))).toHaveLength(1);
    expect(fixtures.api.post).not.toHaveBeenCalled();
  });

  it('retains the duty roster when swaps fail and retries only swap history', async () => {
    fixtures.api.get.mockImplementation(async (path: string) => {
      if (path.endsWith('/invigilation')) return [duty];
      throw new Error('Duty swaps unavailable');
    });
    render(<FacultyInvigilationPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Duty swaps unavailable');
    expect(screen.getByText('Morning duty')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request Unavailability' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Request Swap' })).toBeDisabled();
    fixtures.api.get.mockResolvedValue([incomingSwap]);
    fireEvent.click(screen.getByRole('button', { name: 'Retry swaps' }));

    await screen.findByText('Peer Faculty requests a swap');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Request Swap' })).toBeEnabled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(fixtures.api.get.mock.calls.filter(([path]) => path.endsWith('/invigilation'))).toHaveLength(1);
    expect(fixtures.api.post).not.toHaveBeenCalled();
  });

  it('shows an empty roster only for a successful empty duty response', async () => {
    fixtures.api.get.mockResolvedValue([]);
    render(<FacultyInvigilationPage />);

    await screen.findByText('No invigilation duties assigned yet.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Retry/ })).not.toBeInTheDocument();
    expect(fixtures.api.post).not.toHaveBeenCalled();
  });
});
