import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StudentExamsPage from '@/app/(portals)/student/exams/page';

const mocks = vi.hoisted(() => ({
  api: { get: vi.fn() },
  schedule: vi.fn(), eligibility: vi.fn(), myApplications: vi.fn(),
  issuedAdmitCards: vi.fn(), studentResults: vi.fn(),
  success: vi.fn(), error: vi.fn(),
  auth: { token: 'fixture-token', user: { user_id: 'fixture-student' } },
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => mocks.api }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock('@/lib/api/api.exams', () => ({ examsApi: mocks }));
vi.mock('@/lib/api/api.academics', () => ({ academicsApi: mocks }));
vi.mock('@/lib/api/client', () => ({ API_URL: 'http://api.test', authHeaders: (token: string) => ({ Authorization: `Bearer ${token}` }) }));
vi.mock('@/lib/student-demo-mode', () => ({ isStudentDemoModeEnabled: () => false }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: mocks }));
vi.mock('@/components/attendance/StudentExemptionPanel', () => ({ StudentExemptionPanel: () => null }));

const ticket = {
  entry_id: '11111111-1111-4111-8111-111111111111',
  session_id: '22222222-2222-4222-8222-222222222222',
  session_name: 'Verified examination', semester: 4,
  issued_at: '2026-10-23T00:00:00Z', status: 'ISSUED',
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.token = 'fixture-token';
  mocks.api.get.mockResolvedValue({ seating: [] });
  mocks.schedule.mockResolvedValue([]);
  mocks.myApplications.mockResolvedValue([]);
  mocks.studentResults.mockResolvedValue({ exam_reports: [] });
  mocks.eligibility.mockResolvedValue({ eligible: true, attendance_percent: 90, min_required: 75, reasons: [] });
  mocks.issuedAdmitCards.mockResolvedValue([]);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function openAdmit() {
  fireEvent.click(await screen.findByRole('button', { name: /Admit Card/ }));
  return screen.getByRole('button', { name: 'Download Admit Card (PDF)' });
}

describe('student issued hall-ticket screen', () => {
  it('does not confuse eligibility with official issuance', async () => {
    render(<StudentExamsPage />);
    expect(await openAdmit()).toBeDisabled();
    expect(await screen.findByText(/No verified issued ticket is available/)).toBeVisible();
    expect(mocks.issuedAdmitCards).toHaveBeenCalledWith('fixture-token');
    expect(mocks.studentResults).toHaveBeenCalledWith('fixture-token');
  });

  it('shows a loading state while the issued record is unresolved', async () => {
    mocks.issuedAdmitCards.mockReturnValue(new Promise(() => {}));
    render(<StudentExamsPage />);
    expect(await openAdmit()).toBeDisabled();
    expect(screen.getByText('Checking issued tickets…')).toBeVisible();
  });

  it('shows an API error rather than treating a failure as no tickets', async () => {
    mocks.issuedAdmitCards.mockRejectedValue(new Error('Issuance records unavailable'));
    render(<StudentExamsPage />);
    expect(await openAdmit()).toBeDisabled();
    expect(await screen.findByRole('alert')).toHaveTextContent('Issuance records unavailable');
    expect(screen.queryByText(/No verified issued ticket is available/)).not.toBeInTheDocument();
  });

  it('requires a selection when multiple officially issued tickets exist', async () => {
    mocks.issuedAdmitCards.mockResolvedValue([ticket, { ...ticket, entry_id: '33333333-3333-4333-8333-333333333333', session_name: 'Second examination' }]);
    render(<StudentExamsPage />);
    const button = await openAdmit();
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Issued examination ticket'), { target: { value: ticket.entry_id } });
    expect(button).toBeEnabled();
  });

  it('downloads through the authenticated endpoint with only the issued entry ID', async () => {
    mocks.issuedAdmitCards.mockResolvedValue([ticket]);
    const fetcher = vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(new Blob(['%PDF-fixture'], { type: 'application/pdf' })) });
    vi.stubGlobal('fetch', fetcher);
    vi.stubGlobal('URL', class extends URL {
      static createObjectURL = vi.fn(() => 'blob:issued');
      static revokeObjectURL = vi.fn();
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<StudentExamsPage />);
    fireEvent.click(await openAdmit());
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith('Officially issued admit card downloaded'));
    expect(fetcher).toHaveBeenCalledWith(`http://api.test/api/academics/exams/admit-card?entry_id=${ticket.entry_id}`, {
      headers: { Authorization: 'Bearer fixture-token' },
    });
    expect(click).toHaveBeenCalledOnce();
  });

  it('does not show success when authorization is revoked before download', async () => {
    mocks.issuedAdmitCards.mockResolvedValue([ticket]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403, text: () => Promise.resolve('{"message":"Ticket approval required"}') }));
    render(<StudentExamsPage />);
    fireEvent.click(await openAdmit());
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it('retains the existing clearance gate even when an issued record exists', async () => {
    mocks.issuedAdmitCards.mockResolvedValue([ticket]);
    mocks.eligibility.mockResolvedValue({ eligible: false, attendance_percent: 90, reasons: [{ code: 'PENDING_FEE_DUES', message: 'Outstanding fees' }] });
    render(<StudentExamsPage />);
    expect(await openAdmit()).toBeDisabled();
  });

  it('does not keep a previous authenticated session ticket selectable after identity changes', async () => {
    mocks.issuedAdmitCards.mockResolvedValue([ticket]);
    const view = render(<StudentExamsPage />);
    expect(await openAdmit()).toBeEnabled();
    mocks.auth.token = 'different-session-token';
    mocks.issuedAdmitCards.mockReturnValue(new Promise(() => {}));
    view.rerender(<StudentExamsPage />);
    // The existing page briefly replaces its content with a loading screen.
    // The old ticket must be absent both immediately and after that reload.
    expect(screen.queryByLabelText('Issued examination ticket')).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Download Admit Card (PDF)' })).toBeDisabled();
    expect(screen.queryByLabelText('Issued examination ticket')).not.toBeInTheDocument();
    expect(screen.getByText('Checking issued tickets…')).toBeVisible();
  });
});
