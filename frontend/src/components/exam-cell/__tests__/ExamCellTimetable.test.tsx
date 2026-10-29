import type { ComponentProps } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TimetablePage from '@/app/(portals)/exam-cell/schedule/page';

const mocks = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn() },
  user: { user_id: 'actor-a', tenant_id: 'tenant-a', role: 'ExamCell', primaryRole: 'ExamCell', roles: ['ExamCell'] },
  success: vi.fn(), error: vi.fn(),
}));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => mocks.api }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock('@/components/ui/select', () => ({ Select: ({ children, ...props }: ComponentProps<'select'>) => <select {...props}>{children}</select> }));

const session = { session_id: 'session-a', session_name: 'Authorized exam session', semester: 4, status: 'OPEN' };
const secondSession = { session_id: 'session-b', session_name: 'Second exam session', semester: 6, status: 'ACTIVE' };
const subject = { subject_id: 7, subject_code: 'QA-OS', subject_name: 'Operating Systems', semester: 4 };
const schedule = {
  exam_schedule_id: 'schedule-a', session_id: session.session_id,
  exam_type: 'END_TERM', subject_name: subject.subject_name, subject_code: subject.subject_code,
  exam_date: '2026-11-20', start_time: '09:00:00', end_time: '12:00:00', venue: 'QA Hall', status: 'SCHEDULED',
};

beforeEach(() => {
  vi.resetAllMocks();
  Object.assign(mocks.user, { user_id: 'actor-a', tenant_id: 'tenant-a', role: 'ExamCell', primaryRole: 'ExamCell', roles: ['ExamCell'] });
  mocks.api.get.mockImplementation(async (path: string) => {
    if (path === '/api/exam-cell/sessions') return [session, secondSession];
    if (path === '/api/exam-cell/subjects') return [subject, { subject_id: 8, subject_code: 'QA-6', subject_name: 'Other Semester Subject', semester: 6 }];
    if (path.startsWith('/api/exam-cell/schedules?')) return [];
    throw new Error('Unexpected test request: ' + path);
  });
  mocks.api.post.mockResolvedValue([schedule]);
});

async function selectSession(id = session.session_id) {
  await screen.findByRole('option', { name: /Authorized exam session · Semester 4/ });
  fireEvent.change(screen.getByLabelText('Select session'), { target: { value: id } });
}

function fillForm() {
  fireEvent.change(screen.getByLabelText('Exam type'), { target: { value: 'END_TERM' } });
  fireEvent.change(screen.getByLabelText('Subject'), { target: { value: String(subject.subject_id) } });
  fireEvent.change(screen.getByLabelText('Exam date'), { target: { value: '2026-11-20' } });
  fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '09:00' } });
  fireEvent.change(screen.getByLabelText('End time'), { target: { value: '12:00' } });
  fireEvent.change(screen.getByLabelText('Venue'), { target: { value: '  QA Hall  ' } });
}

describe('Session-linked Exam Cell timetable', () => {
  it('loads actual sessions and subjects without querying a guessed timetable or filling fabricated defaults', async () => {
    render(<TimetablePage />);
    await screen.findByRole('option', { name: /Authorized exam session/ });
    expect(mocks.api.get).toHaveBeenCalledWith('/api/exam-cell/sessions');
    expect(mocks.api.get).toHaveBeenCalledWith('/api/exam-cell/subjects');
    expect(mocks.api.get).not.toHaveBeenCalledWith('/api/exam-cell/schedules');
    expect(mocks.api.get).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText('Venue')).toHaveValue('');
    expect(screen.getByLabelText('Start time')).toHaveValue('');
    expect(screen.getByLabelText('End time')).toHaveValue('');
    expect(screen.getByLabelText('Batch label (optional metadata)')).toHaveValue('');
    expect(screen.getByLabelText('Maximum marks (optional)')).toHaveValue(null);
    expect(screen.getByRole('button', { name: 'Add to schedule' })).toBeDisabled();
    expect(mocks.api.post).not.toHaveBeenCalled();
  });

  it('posts the selected real session and subject and omits blank optional metadata/defaults', async () => {
    let saved = false;
    mocks.api.get.mockImplementation(async (path: string) => path === '/api/exam-cell/sessions' ? [session] : path === '/api/exam-cell/subjects' ? [subject] : saved ? [schedule] : []);
    mocks.api.post.mockImplementation(async () => { saved = true; return [schedule]; });
    render(<TimetablePage />);
    await selectSession();
    await screen.findByText('No exams scheduled for this session.');
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'Add to schedule' }));
    expect(await screen.findByText('Operating Systems · END_TERM')).toBeVisible();
    expect(mocks.api.post).toHaveBeenCalledWith('/api/exam-cell/schedules', {
      session_id: session.session_id, exam_type: 'END_TERM', subject_id: subject.subject_id,
      exam_date: '2026-11-20', start_time: '09:00', end_time: '12:00', venue: 'QA Hall',
    });
    expect(mocks.success).toHaveBeenCalledWith('Exam slot saved');
    expect(mocks.success).not.toHaveBeenCalledWith(expect.stringMatching(/notified|delivered/i));
    expect(mocks.api.get).toHaveBeenCalledWith('/api/exam-cell/schedules?session_id=session-a');
    expect(screen.getByText('1 timetable entries · Authorized exam session')).toBeVisible();
  });

  it('lets only ExamCell release all prepared session slots and then locks preparation', async () => {
    let status = 'SCHEDULED';
    mocks.api.get.mockImplementation(async (path: string) => {
      if (path === '/api/exam-cell/sessions') return [session];
      if (path === '/api/exam-cell/subjects') return [subject];
      if (path.startsWith('/api/exam-cell/schedules?')) return [{ ...schedule, status }];
      throw new Error('Unexpected test request: ' + path);
    });
    mocks.api.post.mockImplementation(async (path: string) => {
      if (path !== `/api/exam-cell/sessions/${session.session_id}/timetable/release`) throw new Error('Unexpected timetable mutation: ' + path);
      status = 'RELEASED';
      return [{ ...schedule, status }];
    });
    render(<TimetablePage />);
    await selectSession();
    await screen.findByText('Operating Systems · END_TERM');
    fireEvent.click(screen.getByRole('button', { name: 'Release timetable to students' }));
    expect(await screen.findByText('This timetable is officially released. Students can see its active exam slots, and new slots are locked for this session.')).toBeVisible();
    expect(mocks.api.post).toHaveBeenCalledWith(`/api/exam-cell/sessions/${session.session_id}/timetable/release`, {});
    expect(mocks.success).toHaveBeenCalledWith('Timetable released to students');
    expect(screen.getByRole('button', { name: 'Add to schedule' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Release timetable to students' })).not.toBeInTheDocument();
  });

  it('sends optional maximum marks and batch label only as explicitly entered metadata', async () => {
    render(<TimetablePage />);
    await selectSession();
    await screen.findByText('No exams scheduled for this session.');
    fillForm();
    fireEvent.change(screen.getByLabelText('Maximum marks (optional)'), { target: { value: '60' } });
    fireEvent.change(screen.getByLabelText('Batch label (optional metadata)'), { target: { value: '  Custom label  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to schedule' }));
    await waitFor(() => expect(mocks.api.post).toHaveBeenCalledWith('/api/exam-cell/schedules', expect.objectContaining({ session_id: session.session_id, max_marks: 60, batch_label: 'Custom label' })));
  });

  it('filters subject labels for the selected semester without treating the catalogue as authorization', async () => {
    render(<TimetablePage />);
    await selectSession();
    await screen.findByText('No exams scheduled for this session.');
    expect(screen.getByRole('option', { name: /QA-OS — Operating Systems/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Other Semester Subject/ })).not.toBeInTheDocument();
    expect(screen.getByText(/backend verifies official enrollment and allocation/)).toBeVisible();
  });

  it('validates missing fields, reversed times and invalid maximum marks before writing', async () => {
    render(<TimetablePage />);
    await selectSession();
    await screen.findByText('No exams scheduled for this session.');
    const add = screen.getByRole('button', { name: 'Add to schedule' });
    fireEvent.click(add);
    expect(screen.getByRole('alert')).toHaveTextContent('Select the session, subject and exam type');
    fillForm();
    fireEvent.change(screen.getByLabelText('End time'), { target: { value: '08:00' } });
    fireEvent.click(add);
    expect(screen.getByRole('alert')).toHaveTextContent('End time must be after start time');
    fireEvent.change(screen.getByLabelText('End time'), { target: { value: '12:00' } });
    fireEvent.change(screen.getByLabelText('Maximum marks (optional)'), { target: { value: '1.5' } });
    fireEvent.click(add);
    expect(screen.getByRole('alert')).toHaveTextContent('Maximum marks must be a positive whole number');
    expect(mocks.api.post).not.toHaveBeenCalled();
  });

  it('prevents duplicate submissions while the authorized write is pending', async () => {
    let complete!: (value: unknown) => void;
    mocks.api.post.mockReturnValue(new Promise((resolve) => { complete = resolve; }));
    render(<TimetablePage />);
    await selectSession();
    await screen.findByText('No exams scheduled for this session.');
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'Add to schedule' }));
    const saving = screen.getByRole('button', { name: 'Saving…' });
    expect(saving).toBeDisabled();
    expect(screen.getByLabelText('Select session')).toBeDisabled();
    fireEvent.click(saving);
    expect(mocks.api.post).toHaveBeenCalledTimes(1);
    await act(async () => { complete([schedule]); });
  });

  it('shows backend rejection without claiming a saved slot or delivered notifications', async () => {
    mocks.api.post.mockRejectedValue(new Error('Subject allocation is ambiguous'));
    render(<TimetablePage />);
    await selectSession();
    await screen.findByText('No exams scheduled for this session.');
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'Add to schedule' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Subject allocation is ambiguous');
    expect(screen.getByLabelText('Venue')).toHaveValue('  QA Hall  ');
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it('does not claim success for a wrong-session save response', async () => {
    mocks.api.post.mockResolvedValue([{ ...schedule, session_id: secondSession.session_id }]);
    render(<TimetablePage />);
    await selectSession();
    await screen.findByText('No exams scheduled for this session.');
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'Add to schedule' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Session timetable could not be verified');
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it.each(['CLOSED', 'ARCHIVED'])('blocks creation for the %s session without altering its status', async (status) => {
    mocks.api.get.mockImplementation(async (path: string) => path === '/api/exam-cell/sessions' ? [{ ...session, status }] : path === '/api/exam-cell/subjects' ? [subject] : []);
    render(<TimetablePage />);
    await selectSession();
    expect(await screen.findByText(/selected session is closed or archived/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add to schedule' })).toBeDisabled();
    expect(mocks.api.post).not.toHaveBeenCalled();
  });

  it('allows an active ExamOperator to read but not to borrow secondary ExamCell write permissions', async () => {
    mocks.user.primaryRole = 'ExamOperator';
    render(<TimetablePage />);
    await selectSession();
    await screen.findByText('No exams scheduled for this session.');
    expect(screen.queryByRole('button', { name: 'Add to schedule' })).not.toBeInTheDocument();
    expect(mocks.api.post).not.toHaveBeenCalled();
  });

  it('rejects an unauthorized active role before making requests', () => {
    mocks.user.primaryRole = 'Student';
    render(<TimetablePage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Your active role cannot access the examination timetable');
    expect(mocks.api.get).not.toHaveBeenCalled();
    expect(mocks.api.post).not.toHaveBeenCalled();
  });

  it('rejects missing authenticated tenant context before making requests', () => {
    mocks.user.tenant_id = '';
    render(<TimetablePage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Authenticated tenant and user context is unavailable');
    expect(mocks.api.get).not.toHaveBeenCalled();
  });

  it('distinguishes empty actual sessions from failed source requests', async () => {
    mocks.api.get.mockResolvedValue([]);
    render(<TimetablePage />);
    expect(await screen.findByText(/No examination sessions are available/)).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mocks.api.get).toHaveBeenCalledTimes(2);
  });

  it('shows a failed source request honestly and supports retry', async () => {
    mocks.api.get.mockRejectedValueOnce(new Error('Sessions unavailable'));
    render(<TimetablePage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Sessions unavailable');
    expect(screen.queryByText(/No examination sessions are available/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading session data' }));
    await screen.findByRole('option', { name: /Authorized exam session/ });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows timetable loading, forbidden error and retry without false empty records', async () => {
    let attempts = 0;
    mocks.api.get.mockImplementation(async (path: string) => {
      if (path === '/api/exam-cell/sessions') return [session];
      if (path === '/api/exam-cell/subjects') return [subject];
      if (++attempts === 1) throw new Error('Forbidden tenant scope');
      return [schedule];
    });
    render(<TimetablePage />);
    await selectSession();
    expect(await screen.findByRole('alert')).toHaveTextContent('Forbidden tenant scope');
    expect(screen.queryByText('No exams scheduled for this session.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh timetable' }));
    expect(await screen.findByText('Operating Systems · END_TERM')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('rejects a different session timetable response rather than displaying or relinking it', async () => {
    mocks.api.get.mockImplementation(async (path: string) => path === '/api/exam-cell/sessions' ? [session] : path === '/api/exam-cell/subjects' ? [subject] : [{ ...schedule, session_id: null }]);
    render(<TimetablePage />);
    await selectSession();
    expect(await screen.findByRole('alert')).toHaveTextContent('Session timetable could not be verified');
    expect(screen.queryByText('Operating Systems · END_TERM')).not.toBeInTheDocument();
  });

  it('ignores a late timetable response after changing sessions', async () => {
    let complete!: (value: unknown) => void;
    mocks.api.get.mockImplementation((path: string) => {
      if (path === '/api/exam-cell/sessions') return Promise.resolve([session, secondSession]);
      if (path === '/api/exam-cell/subjects') return Promise.resolve([subject]);
      return path.includes('session_id=session-a') ? new Promise((resolve) => { complete = resolve; }) : Promise.resolve([]);
    });
    render(<TimetablePage />);
    await selectSession();
    await screen.findByText('Loading session timetable…');
    fireEvent.change(screen.getByLabelText('Select session'), { target: { value: secondSession.session_id } });
    await screen.findByText('No exams scheduled for this session.');
    await act(async () => { complete([schedule]); });
    expect(screen.queryByText('Operating Systems · END_TERM')).not.toBeInTheDocument();
    expect(screen.getByText('0 timetable entries · Second exam session')).toBeVisible();
  });

  it('clears the prior session form when selecting a different actual session', async () => {
    render(<TimetablePage />);
    await selectSession();
    await screen.findByText('No exams scheduled for this session.');
    fillForm();
    fireEvent.change(screen.getByLabelText('Select session'), { target: { value: secondSession.session_id } });
    await screen.findByText('No exams scheduled for this session.');
    expect(screen.getByLabelText('Venue')).toHaveValue('');
    expect(screen.getByLabelText('Start time')).toHaveValue('');
    expect(screen.getByLabelText('Subject')).toHaveValue('');
  });

  it('hides prior tenant timetable and ignores a late response after authentication changes', async () => {
    let complete!: (value: unknown) => void;
    mocks.api.get.mockImplementation((path: string) => {
      if (path === '/api/exam-cell/sessions') return Promise.resolve([session]);
      if (path === '/api/exam-cell/subjects') return Promise.resolve([subject]);
      return new Promise((resolve) => { complete = resolve; });
    });
    const view = render(<TimetablePage />);
    await selectSession();
    await screen.findByText('Loading session timetable…');
    mocks.user.tenant_id = 'tenant-b';
    mocks.api.get.mockReturnValue(new Promise(() => {}));
    view.rerender(<TimetablePage />);
    await act(async () => { complete([schedule]); });
    expect(screen.queryByText('Operating Systems · END_TERM')).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Authorized exam session/ })).not.toBeInTheDocument();
  });

  it('does not report success or revive old records if authentication changes during saving', async () => {
    let complete!: (value: unknown) => void;
    mocks.api.post.mockReturnValue(new Promise((resolve) => { complete = resolve; }));
    const view = render(<TimetablePage />);
    await selectSession();
    await screen.findByText('No exams scheduled for this session.');
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'Add to schedule' }));
    mocks.user.primaryRole = 'Student';
    view.rerender(<TimetablePage />);
    await act(async () => { complete([schedule]); });
    expect(mocks.success).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Your active role cannot access the examination timetable');
  });
});
