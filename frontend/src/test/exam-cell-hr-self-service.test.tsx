import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WorkforcePage from '@/app/(portals)/exam-cell/me/workforce/page';
import PayslipsPage from '@/app/(portals)/exam-cell/me/payslips/page';
import DocumentsPage from '@/app/(portals)/exam-cell/me/documents/page';
import { withFacultyDemoFallback } from '@/lib/faculty-demo-mode';

const { api, route, toast } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
  route: { pathname: '/exam-cell/me/workforce', view: '' },
  toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => api }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({
  user: { user_id: 'synthetic-exam-employee', role: 'ExamCell' }, token: 'synthetic-test-token',
}) }));
vi.mock('next/navigation', () => ({
  usePathname: () => route.pathname,
  useSearchParams: () => new URLSearchParams(route.view),
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast }));
vi.mock('@/components/faculty/ProxyTeachingDialog', () => ({ ProxyTeachingDialog: () => <p>Teaching proxy dialog</p> }));

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('NEXT_PUBLIC_FACULTY_DEMO_MODE', 'true');
  route.pathname = '/exam-cell/me/workforce'; route.view = '';
  api.get.mockReset(); api.post.mockReset(); api.patch.mockReset();
  toast.error.mockReset(); toast.success.mockReset();
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('Exam Cell employee self-service', () => {
  it('can explicitly prevent demo fallbacks even when faculty demo mode is enabled', () => {
    expect(withFacultyDemoFallback([], ['fake'], value => value.length === 0, false)).toEqual([]);
    expect(withFacultyDemoFallback(null, ['fake'], undefined, false)).toBeNull();
  });

  it('shows genuine empty leave history without demo balances or requests', async () => {
    api.get.mockResolvedValue([]);
    render(<WorkforcePage />);
    expect(await screen.findByText('No leave requests yet.')).toBeTruthy();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/hr/leaves/my-balances'));
    expect(api.get).toHaveBeenCalledWith('/api/hr/workforce/my-requests');
    expect(screen.queryByText(/Used \d+ of/)).toBeNull();
    expect(screen.queryByText('Teaching proxy dialog')).toBeNull();
  });

  it('reports failed leave loading and retries the real endpoints', async () => {
    api.get.mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValue([]);
    render(<WorkforcePage />);
    expect(await screen.findByText(/Some leave information could not be loaded/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByText(/Some leave information could not be loaded/)).toBeNull());
    expect(screen.queryByText(/Used \d+ of/)).toBeNull();
  });

  it('shows only persisted calendar metadata when no holidays or leave exist', async () => {
    route.view = 'view=calendar';
    const month = new Date().toISOString().slice(0, 7);
    api.get.mockImplementation((path: string) => Promise.resolve(path.includes('/ess/calendar')
      ? { month, shift: null, holidays: [], leaves: [] }
      : { month, days: [] }));
    render(<WorkforcePage />);
    expect(await screen.findByText('No holidays scheduled this month.')).toBeTruthy();
    expect(screen.getByText('No leave or OD requests overlap this month.')).toBeTruthy();
    expect(screen.queryByText(/General:/)).toBeNull();
  });

  it('shows an attendance failure instead of silently rendering a blank calendar', async () => {
    route.view = 'view=calendar';
    api.get.mockRejectedValue(new Error('Calendar unavailable'));
    render(<WorkforcePage />);
    expect(await screen.findByText(/Attendance could not be loaded/)).toBeTruthy();
    expect(screen.getByText(/Holidays and leave could not be loaded/)).toBeTruthy();
  });

  it('keeps an empty document vault empty with faculty demo mode enabled', async () => {
    route.pathname = '/exam-cell/me/documents';
    api.get.mockResolvedValue({ documents: [], groups: {}, stats: {} });
    render(<DocumentsPage />);
    expect(await screen.findByText('No documents uploaded yet')).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith('/api/hr/ess/documents');
    expect(screen.queryByRole('button', { name: 'Verify' })).toBeNull();
  });

  it('shows and retries a document API failure without demo documents', async () => {
    route.pathname = '/exam-cell/me/documents';
    api.get.mockRejectedValueOnce(new Error('Vault unavailable')).mockResolvedValue({ documents: [], groups: {}, stats: {} });
    render(<DocumentsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Documents could not be loaded');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No documents uploaded yet')).toBeTruthy();
  });

  it('uploads personal documents through the private HR document purpose', async () => {
    route.pathname = '/exam-cell/me/documents';
    api.get.mockResolvedValue({ documents: [], groups: {}, stats: {} });
    api.post.mockResolvedValue({ document_id: 'synthetic-document' });
    const upload = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ path: '/uploads/synthetic-private-document.pdf' }) });
    vi.stubGlobal('fetch', upload);
    const { container } = render(<DocumentsPage />);
    await screen.findByText('No documents uploaded yet');
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).toBeTruthy();
    fireEvent.change(input!, { target: { files: [new File(['Synthetic document'], 'synthetic.pdf', { type: 'application/pdf' })] } });
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/hr/ess/documents', expect.objectContaining({ file_name: 'synthetic.pdf' })));
    const body = upload.mock.calls[0][1].body as FormData;
    expect(body.get('purpose')).toBe('HR_DOCUMENT');
    expect(body.get('file')).toBeInstanceOf(File);
  });

  it('does not claim there are no payslips when the salary API fails', async () => {
    route.pathname = '/exam-cell/me/payslips';
    api.get.mockRejectedValue(new Error('Payroll unavailable'));
    render(<PayslipsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Payslips could not be loaded');
    expect(screen.queryByText('No payslips published yet')).toBeNull();
  });

  it('shows the genuine empty payroll state after successful reads', async () => {
    route.pathname = '/exam-cell/me/payslips';
    api.get.mockResolvedValue([]);
    render(<PayslipsPage />);
    expect(await screen.findByText('No payslips published yet')).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith('/api/hr/payslips/my-payslips');
    expect(api.get).toHaveBeenCalledWith('/api/hr/payslips/download-requests/mine');
  });
});
