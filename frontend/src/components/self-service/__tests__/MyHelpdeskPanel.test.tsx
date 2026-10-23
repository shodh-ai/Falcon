import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MyHelpdeskPanel } from '../MyHelpdeskPanel';

const mocks = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() }, success: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => mocks.api }));
vi.mock('next/navigation', () => ({ usePathname: () => '/faculty/me/tickets' }));
vi.mock('next/link', () => ({ default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock('@/lib/faculty-demo-mode', () => ({ isEmptyArray: () => true, withFacultyDemoFallback: (rows: unknown) => rows }));
vi.mock('@/lib/mock/faculty-portal-demo', () => ({ facultyDemoHelpdeskTickets: () => [] }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}
const ticket = { ticket_id: 'ticket-one', ticket_ref: 'TKT-TEST', category: 'IT', status: 'PENDING', subject: 'Synthetic WiFi ticket' };
const fill = () => {
  fireEvent.change(screen.getByPlaceholderText('Subject'), { target: { value: '  Synthetic WiFi ticket  ' } });
  fireEvent.change(screen.getByPlaceholderText('Describe the issue'), { target: { value: '  Synthetic ticket description  ' } });
};

describe('helpdesk account scope and saved drafts', () => {
  beforeEach(() => {
    mocks.api = { get: vi.fn().mockResolvedValue([]), post: vi.fn().mockResolvedValue(ticket) };
    mocks.success.mockReset(); mocks.error.mockReset();
  });
  afterEach(cleanup);

  it('shows a failed read with Retry instead of an empty history', async () => {
    mocks.api.get.mockRejectedValueOnce(new Error('Tickets unavailable')).mockResolvedValue([ticket]);
    render(<MyHelpdeskPanel />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Tickets unavailable');
    expect(screen.queryByText('No tickets yet.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText(ticket.subject)).toBeInTheDocument();
  });

  it('sends trimmed fields once and locks category and draft fields during submission', async () => {
    const save = deferred<typeof ticket>(); mocks.api.post.mockReturnValue(save.promise);
    render(<MyHelpdeskPanel />);
    await screen.findByText('No tickets yet.'); fill();
    const button = screen.getByRole('button', { name: 'Submit ticket' });
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    expect(mocks.api.post).toHaveBeenCalledTimes(1);
    expect(mocks.api.post).toHaveBeenCalledWith('/api/helpdesk/tickets', { category: 'IT', subject: ticket.subject, description: 'Synthetic ticket description' });
    expect(screen.getByPlaceholderText('Subject')).toBeDisabled();
    expect(screen.getByPlaceholderText('Describe the issue')).toBeDisabled();
    expect(screen.getByRole('combobox')).toBeDisabled();
    await act(async () => { save.resolve(ticket); });
    expect(screen.getByPlaceholderText('Subject')).toHaveValue('');
  });

  it('preserves the subject and description when create fails', async () => {
    mocks.api.post.mockRejectedValueOnce(new Error('Create unavailable'));
    render(<MyHelpdeskPanel />);
    await screen.findByText('No tickets yet.'); fill();
    fireEvent.click(screen.getByRole('button', { name: 'Submit ticket' }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Create unavailable'));
    expect(screen.getByPlaceholderText('Subject')).toHaveValue('  Synthetic WiFi ticket  ');
    expect(screen.getByPlaceholderText('Describe the issue')).toHaveValue('  Synthetic ticket description  ');
    expect(screen.getByRole('button', { name: 'Submit ticket' })).toBeEnabled();
  });

  it('retains a confirmed ticket when refresh fails and does not report create failure', async () => {
    mocks.api.get.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('Refresh unavailable')).mockResolvedValue([]);
    render(<MyHelpdeskPanel />);
    await screen.findByText('No tickets yet.'); fill();
    fireEvent.click(screen.getByRole('button', { name: 'Submit ticket' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Refresh unavailable');
    expect(screen.getByText(ticket.subject)).toBeInTheDocument();
    expect(mocks.success).toHaveBeenCalledWith('Ticket created');
    expect(mocks.error).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByText(ticket.subject)).toBeInTheDocument();
    expect(mocks.api.post).toHaveBeenCalledTimes(1);
  });

  it('ignores a late history response after switching accounts', async () => {
    const old = deferred<unknown[]>(); mocks.api.get.mockReturnValue(old.promise);
    const { rerender } = render(<MyHelpdeskPanel />);
    mocks.api = { get: vi.fn().mockResolvedValue([]), post: vi.fn() };
    rerender(<MyHelpdeskPanel />);
    await screen.findByText('No tickets yet.');
    await act(async () => { old.resolve([ticket]); });
    expect(screen.queryByText(ticket.subject)).not.toBeInTheDocument();
  });

  it('does not clear a new account’s draft when an old create completes', async () => {
    const save = deferred<typeof ticket>(); mocks.api.post.mockReturnValue(save.promise);
    const oldApi = mocks.api;
    const { rerender } = render(<MyHelpdeskPanel />);
    await screen.findByText('No tickets yet.'); fill();
    fireEvent.click(screen.getByRole('button', { name: 'Submit ticket' }));
    mocks.api = { get: vi.fn().mockResolvedValue([]), post: vi.fn() };
    rerender(<MyHelpdeskPanel />);
    await screen.findByText('No tickets yet.');
    fireEvent.change(screen.getByPlaceholderText('Subject'), { target: { value: 'New account draft' } });
    await act(async () => { save.resolve(ticket); });
    expect(screen.getByPlaceholderText('Subject')).toHaveValue('New account draft');
    expect(screen.queryByText(ticket.subject)).not.toBeInTheDocument();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(oldApi.get).toHaveBeenCalledTimes(1);
  });
});
