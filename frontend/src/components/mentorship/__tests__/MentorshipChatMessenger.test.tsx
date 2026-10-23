import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MentorshipChatMessenger } from '../MentorshipChatMessenger';

const state = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn() },
  toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => state.api }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: state.toast }));
vi.mock('@/lib/faculty-demo-mode', () => ({
  isEmptyArray: (rows: unknown[]) => !rows?.length,
  isFacultyDemoSmokeId: () => false,
  withFacultyDemoFallback: (rows: unknown[]) => rows,
}));
vi.mock('@/lib/mock/faculty-portal-demo', () => ({
  facultyDemoChatMentees: () => [],
  getFacultyPortalDemoPack: () => ({ messages: [] }),
}));

const mentees = ['one', 'two'].map(id => ({
  student_user_id: id, student_name: `Student ${id}`, student_email: `${id}@example.test`,
  unread_count: 0, last_message_at: null, last_message_preview: null,
}));
const message = (text: string) => [{
  message_id: text, sender_type: 'STUDENT', message_text: text, sent_at: '2026-10-23T05:30:00Z',
}];
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.api = {
    get: vi.fn((url: string) => Promise.resolve(url.endsWith('/mentees') ? mentees : [])),
    post: vi.fn().mockResolvedValue({}),
  };
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { value: vi.fn(), configurable: true });
});
afterEach(cleanup);

describe('mentorship conversation ownership', () => {
  it('keeps the selected conversation when the previous thread finishes late', async () => {
    const first = deferred<ReturnType<typeof message>>();
    state.api.get.mockImplementation((url: string) => url.endsWith('/mentees')
      ? Promise.resolve(mentees) : url.endsWith('/one') ? first.promise : Promise.resolve(message('Second conversation')));
    render(<MentorshipChatMessenger />);
    await waitFor(() => expect(state.api.get).toHaveBeenCalledWith('/api/academics/proctor/chat/thread/one'));
    fireEvent.click(screen.getByRole('button', { name: /Student two/ }));
    expect(await screen.findByText('Second conversation')).toBeInTheDocument();
    await act(async () => first.resolve(message('Late first conversation')));
    expect(screen.queryByText('Late first conversation')).not.toBeInTheDocument();
    expect(screen.getByText('Second conversation')).toBeInTheDocument();
  });

  it('does not carry a draft into a different mentee conversation', async () => {
    render(<MentorshipChatMessenger />);
    const input = await screen.findByPlaceholderText('Type a message…');
    await waitFor(() => expect(input).toBeEnabled());
    fireEvent.change(input, { target: { value: 'Private draft for first mentee' } });
    fireEvent.click(screen.getByRole('button', { name: /Student two/ }));
    await waitFor(() => expect(state.api.get).toHaveBeenCalledWith('/api/academics/proctor/chat/thread/two'));
    expect(screen.getByPlaceholderText('Type a message…')).toHaveValue('');
    expect(state.api.post).not.toHaveBeenCalled();
  });

  it('submits only once for two same-tick Enter presses', async () => {
    const pending = deferred<object>();
    state.api.post.mockReturnValue(pending.promise);
    render(<MentorshipChatMessenger />);
    const input = await screen.findByPlaceholderText('Type a message…');
    await waitFor(() => expect(input).toBeEnabled());
    fireEvent.change(input, { target: { value: 'A test message' } });
    act(() => {
      fireEvent.keyDown(input, { key: 'Enter' });
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    expect(state.api.post).toHaveBeenCalledTimes(1);
    expect(state.api.post).toHaveBeenCalledWith('/api/academics/proctor/chat', {
      message: 'A test message', student_user_id: 'one',
    });
    await act(async () => pending.resolve({}));
  });

  it('ignores a previous thread failure and blocks composing until the selected thread loads', async () => {
    const first = deferred<ReturnType<typeof message>>();
    const second = deferred<ReturnType<typeof message>>();
    state.api.get.mockImplementation((url: string) => url.endsWith('/mentees')
      ? Promise.resolve(mentees) : url.endsWith('/one') ? first.promise : second.promise);
    render(<MentorshipChatMessenger />);
    expect(await screen.findByPlaceholderText('Type a message…')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Student two/ }));
    await act(async () => first.reject(new Error('Previous thread failed')));
    expect(state.toast.error).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('Type a message…')).toBeDisabled();
    await act(async () => second.resolve(message('Current thread loaded')));
    expect(screen.getByText('Current thread loaded')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Type a message…')).toBeEnabled();
  });

  it('does not reload a previous conversation when its send finishes after switching', async () => {
    const pending = deferred<object>();
    state.api.post.mockReturnValue(pending.promise);
    state.api.get.mockImplementation((url: string) => Promise.resolve(url.endsWith('/mentees')
      ? mentees : message(url.endsWith('/one') ? 'First thread' : 'Second thread')));
    render(<MentorshipChatMessenger />);
    expect(await screen.findByText('First thread')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Type a message…'), { target: { value: 'For first mentee' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    fireEvent.click(screen.getByRole('button', { name: /Student two/ }));
    expect(await screen.findByText('Second thread')).toBeInTheDocument();
    await act(async () => pending.resolve({}));
    expect(screen.getByText('Second thread')).toBeInTheDocument();
    expect(screen.queryByText('First thread')).not.toBeInTheDocument();
    expect(state.api.get.mock.calls.filter(([url]) => url.endsWith('/thread/one'))).toHaveLength(1);
  });

  it('discards previous account responses when the authenticated API changes', async () => {
    const first = deferred<ReturnType<typeof message>>();
    state.api.get.mockImplementation((url: string) => url.endsWith('/mentees') ? Promise.resolve(mentees) : first.promise);
    const view = render(<MentorshipChatMessenger />);
    await waitFor(() => expect(state.api.get).toHaveBeenCalledWith('/api/academics/proctor/chat/thread/one'));
    state.api = {
      get: vi.fn((url: string) => Promise.resolve(url.endsWith('/mentees')
        ? [{ ...mentees[0], student_user_id: 'three', student_name: 'New account mentee' }]
        : message('New account thread'))),
      post: vi.fn(),
    };
    view.rerender(<MentorshipChatMessenger />);
    expect(await screen.findByText('New account thread')).toBeInTheDocument();
    await act(async () => first.resolve(message('Previous account thread')));
    expect(screen.queryByText('Previous account thread')).not.toBeInTheDocument();
    expect(screen.getByText('New account thread')).toBeInTheDocument();
  });

  it('keeps a failed-send draft and permits a single retry', async () => {
    state.api.post.mockRejectedValueOnce(new Error('Send unavailable')).mockResolvedValueOnce({});
    render(<MentorshipChatMessenger />);
    const input = await screen.findByPlaceholderText('Type a message…');
    await waitFor(() => expect(input).toBeEnabled());
    fireEvent.change(input, { target: { value: 'Keep this draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(state.toast.error).toHaveBeenCalledWith('Send unavailable'));
    expect(input).toHaveValue('Keep this draft');
    expect(input).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(input).toHaveValue(''));
    expect(state.api.post).toHaveBeenCalledTimes(2);
  });
});
