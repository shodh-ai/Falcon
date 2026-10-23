import type { ReactNode, SelectHTMLAttributes } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MentorshipPage from '@/app/(portals)/faculty/mentorship/page';
import ResearchPage from '@/app/(portals)/faculty/research/page';
import ReEvaluationsPage from '@/app/(portals)/faculty/re-evaluations/page';
import IqacPage from '@/app/(portals)/faculty/iqac/page';
import { MeetingWorkspace } from '@/components/meetings/MeetingWorkspace';

const mocks = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), getBlob: vi.fn() },
  success: vi.fn(), error: vi.fn(),
  user: { user_id: 'faculty-test', role: 'Faculty' },
}));

vi.mock('@/lib/api', () => ({ useAuthedApi: () => mocks.api }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('@/lib/api/api.president', () => ({ usePresidentApi: () => ({}) }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock('@/lib/faculty-demo-mode', () => ({
  isEmptyArray: (value: unknown) => Array.isArray(value) && !value.length,
  isFacultyDemoModeEnabled: () => false,
  isFacultyDemoEntityId: () => false,
  isFacultyDemoSmokeId: () => false,
  withFacultyDemoFallback: (live: unknown) => live,
}));
vi.mock('@/components/ui/select', () => ({ Select: (props: SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} /> }));
vi.mock('@/components/faculty', () => ({
  FacultyPageShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  FacultyPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  FacultyPanel: ({ title, children }: { title: string; children: ReactNode }) => <section><h2>{title}</h2>{children}</section>,
  FacultyMetricChip: () => null,
  FacultyPageLoading: ({ label }: { label: string }) => <p>{label}</p>,
  FacultyEmptyState: ({ description }: { description: string }) => <p>{description}</p>,
}));
vi.mock('@/components/mentorship/PendingMeetingRequests', () => ({ PendingMeetingRequests: () => null }));
vi.mock('@/components/mentorship/PendingLeaveRequests', () => ({ PendingLeaveRequests: () => null }));
vi.mock('@/components/mentorship/MentorshipChatMessenger', () => ({ MentorshipChatMessenger: () => null }));
vi.mock('@/components/ecell/EcellMentorInbox', () => ({ EcellMentorInbox: () => null }));
vi.mock('@/components/brand/FalconLoader', () => ({ FalconLoader: () => <p>Loading</p> }));

const mentees = [{ mentorship_id: 'mentor-live', student: { user_id: 'student-live', name: 'Test Mentee', email: 'test@example.test' } }];
const certificate = { certificate_id: 'certificate-live', title: 'Test certificate', issuer: 'Test issuer', student: null };
const caseRow = { exam_application_id: 'case-live', student_name: 'Test Student', subject_name: 'Test Subject', subject_code: 'TEST', status: 'ASSIGNED', exam_link_status: 'linked', exam_max_marks: 100, exam_session: 'Spring 2026', exam_type: 'END_TERM' };

describe('faculty workflow regressions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.api.get.mockResolvedValue([]);
    mocks.api.post.mockResolvedValue({});
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('keeps the real mentorship roster when approvals fail and does not add sample approvals', async () => {
    mocks.api.get.mockImplementation((path: string) => path.endsWith('my-students')
      ? Promise.resolve(mentees) : Promise.reject(new Error('Approvals unavailable')));
    render(<MentorshipPage />);
    expect(await screen.findByText('Test Mentee')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Approvals unavailable');
    expect(screen.getByRole('button', { name: 'Retry approvals' })).toBeEnabled();
    expect(screen.queryByText('No certificates are waiting for your review.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it('keeps real certificate approvals when the roster request fails', async () => {
    mocks.api.get.mockImplementation((path: string) => path.endsWith('my-students')
      ? Promise.reject(new Error('Roster unavailable')) : Promise.resolve({ certificates: [certificate] }));
    render(<MentorshipPage />);
    expect(await screen.findByText('Test certificate')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Roster unavailable');
    expect(screen.getByRole('button', { name: 'Retry mentees' })).toBeEnabled();
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it('does not reject a certificate when the rejection prompt is cancelled', async () => {
    mocks.api.get.mockImplementation(async (path: string) => path.endsWith('my-students') ? mentees : { certificates: [certificate] });
    vi.spyOn(window, 'prompt').mockReturnValue(null);
    render(<MentorshipPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }));
    expect(mocks.api.post).not.toHaveBeenCalled();
    expect(screen.getByText('Test certificate')).toBeInTheDocument();
  });

  it('does not convert an empty revised mark into a zero mark', async () => {
    mocks.api.get.mockResolvedValue([caseRow]);
    render(<ReEvaluationsPage />);
    fireEvent.change(await screen.findByPlaceholderText('Reassessment notes, observations, and justification'), { target: { value: 'Synthetic reassessment notes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit report to Exam Cell' }));
    expect(mocks.api.post).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith('Enter valid revised marks');
    fireEvent.change(screen.getByPlaceholderText('Revised marks'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit report to Exam Cell' }));
    await waitFor(() => expect(mocks.api.post).toHaveBeenCalledWith('/api/academics/faculty/re-evaluations/case-live/report', {
      revised_marks: 0, report_notes: 'Synthetic reassessment notes',
    }));
  });

  it('switches re-evaluation records without re-fetching or overwriting the selected draft', async () => {
    mocks.api.get.mockResolvedValue([caseRow, { ...caseRow, exam_application_id: 'case-two', student_name: 'Second Student' }]);
    render(<ReEvaluationsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Second Student/ }));
    fireEvent.change(screen.getByPlaceholderText('Revised marks'), { target: { value: '45' } });
    expect(mocks.api.get).toHaveBeenCalledTimes(1);
    expect(screen.getByPlaceholderText('Revised marks')).toHaveValue(45);
  });

  it('omits the optional publication date instead of sending an invalid blank SQL date', async () => {
    mocks.api.post.mockResolvedValue({ research_id: 'research-live', publication_title: 'Test publication', publication_type: 'JOURNAL', indexing_type: 'SCOPUS' });
    render(<ResearchPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save to research log' })).toBeEnabled());
    fireEvent.change(screen.getByPlaceholderText('Publication title'), { target: { value: '  Test publication  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save to research log' }));
    await waitFor(() => expect(mocks.api.post).toHaveBeenCalledWith('/api/academics/faculty/workspaces/research', expect.objectContaining({
      publication_title: 'Test publication', published_date: undefined,
    })));
  });

  it('does not carry an IQAC evidence file into a different assignment', async () => {
    mocks.api.get.mockResolvedValue([
      { assignment_id: 'task-one', status: 'PENDING', task: { task_name: 'First task' } },
      { assignment_id: 'task-two', status: 'PENDING', task: { task_name: 'Second task' } },
    ]);
    const { container } = render(<IqacPage />);
    await screen.findByRole('button', { name: /First task/ });
    fireEvent.change(container.querySelector('input[type=file]')!, { target: { files: [new File(['test'], 'evidence.pdf', { type: 'application/pdf' })] } });
    expect(screen.getByRole('button', { name: 'Submit to HOD' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /Second task/ }));
    expect(screen.getByRole('button', { name: 'Submit to HOD' })).toBeDisabled();
    expect(mocks.api.post).not.toHaveBeenCalled();
  });

  it('clears one meeting’s agenda and minutes before editing a different blank meeting', async () => {
    const base = { venue: 'Test room', starts_at: '2026-10-20T10:00:00Z', ends_at: '2026-10-20T11:00:00Z', status: 'SCHEDULED', meeting_mode: 'SCHEDULED', organizer_user_id: 'faculty-test', organizer_name: 'Test organizer', requester_name: 'Test organizer', participants: [] };
    mocks.api.get.mockResolvedValue([
      { ...base, meeting_id: 'meeting-one', title: 'First meeting', agenda: 'First agenda', minutes: { notes: 'First notes', decisions: 'First decisions', action_items: 'First actions' } },
      { ...base, meeting_id: 'meeting-two', title: 'Second meeting', agenda: null, minutes: null },
    ]);
    render(<MeetingWorkspace workspaceLabel="Faculty Portal" hidePageHeader />);
    const agenda = await screen.findByLabelText('Edit meeting agenda', {}, { timeout: 10_000 });
    await waitFor(() => expect(agenda).toHaveValue('First agenda'), { timeout: 5_000 });
    expect(screen.getByLabelText('Meeting notes')).toHaveValue('First notes');
    fireEvent.click(screen.getByRole('button', { name: /Second meeting/ }));
    expect(screen.getByLabelText('Edit meeting agenda')).toHaveValue('');
    expect(screen.getByLabelText('Meeting notes')).toHaveValue('');
    expect(screen.getByLabelText('Meeting decisions')).toHaveValue('');
    expect(screen.getByLabelText('Meeting action items')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Publish minutes' })).toBeDisabled();
    expect(mocks.api.post).not.toHaveBeenCalled();
  });
});
