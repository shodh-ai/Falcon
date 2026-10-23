import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FacultyResearchGrantDetails } from '../FacultyResearchGrantDetails';
import type { RndApplication } from '@/lib/api/api.academic-rnd';

const fixtures = vi.hoisted(() => ({ auth: { user: { user_id: 'faculty-1', tenant_id: 'tenant-1' }, token: 'test-token' as string | null } }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => fixtures.auth }));
vi.mock('@/lib/api/client', () => ({
  getApiBaseUrl: () => 'http://localhost:4000',
  authHeaders: (token: string) => ({ Authorization: `Bearer ${token}`, 'x-tenant-subdomain': 'sgvu' }),
}));

const application: RndApplication = {
  application_id: 'grant-1', config_id: 'config-1', project_title: 'Example proposal',
  config_title: 'Student research grants', requested_budget: '25000.50',
  documents: {}, status: 'PENDING_GUIDE', budget_approved: false,
  submitted_at: '2026-10-19T23:30:00Z',
};
const fetchMock = vi.fn();
const createObjectURL = vi.fn();
const revokeObjectURL = vi.fn();
let click: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  fixtures.auth = { user: { user_id: 'faculty-1', tenant_id: 'tenant-1' }, token: 'test-token' };
  fetchMock.mockResolvedValue({ ok: true, blob: async () => new Blob(['existing document']) });
  vi.stubGlobal('fetch', fetchMock);
  createObjectURL.mockReturnValue('blob:existing-document');
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
  click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('faculty research grant review details', () => {
  it('shows existing budget, programme, application ID and submission time without making a request', () => {
    render(<FacultyResearchGrantDetails application={application} />);
    expect(screen.getByText('₹25,000.50')).toBeInTheDocument();
    expect(screen.getByText('Student research grants')).toBeInTheDocument();
    expect(screen.getByText('grant-1')).toBeInTheDocument();
    expect(screen.getByText(/20 Oct 2026.*5:00 am IST/)).toBeInTheDocument();
    expect(screen.getByText('No supporting documents submitted.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [null, 'Not provided'], ['', 'Not provided'], ['   ', 'Not provided'],
    [0, '₹0.00'], ['invalid', 'Budget unavailable'], [Infinity, 'Budget unavailable'], [-1, 'Budget unavailable'],
  ])('does not present missing or invalid budget %p as a valid amount', (value, expected) => {
    render(<FacultyResearchGrantDetails application={{ ...application, requested_budget: value }} />);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('handles missing programme, invalid submission time and malformed legacy document collections', () => {
    render(<FacultyResearchGrantDetails application={{ ...application, config_title: '', submitted_at: 'invalid', documents: null as unknown as Record<string, string> }} />);
    expect(screen.getByText('Not provided')).toBeInTheDocument();
    expect(screen.getByText('Submission date unavailable')).toBeInTheDocument();
    expect(screen.getByText('No supporting documents submitted.')).toBeInTheDocument();
  });

  it('opens external supporting documents without putting credentials in the URL or sending them to that host', () => {
    render(<FacultyResearchGrantDetails application={{ ...application, documents: { proposal: 'https://example.org/proposal.pdf' } }} />);
    const link = screen.getByRole('link', { name: 'Open proposal' });
    expect(link).toHaveAttribute('href', 'https://example.org/proposal.pdf');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('href')).not.toContain('test-token');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['javascript:alert(1)', 'data:text/html,unsafe', 'file:///private/file', '//example.org/file', 'https://user:password@example.org/file', 'not-a-url'])
    ('does not make an unsafe or unsupported document reference clickable: %s', value => {
      render(<FacultyResearchGrantDetails application={{ ...application, documents: { proposal: value } }} />);
      expect(screen.getByText('Document link unavailable')).toBeInTheDocument();
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    });

  it.each([
    ['/uploads/tenant-1/proposal.pdf', 'path', '/uploads/tenant-1/proposal.pdf'],
    ['./uploads/tenant-1/proposal.pdf', 'path', './uploads/tenant-1/proposal.pdf'],
    ['s3://bucket/tenant-1/proposal.pdf', 'key', 'tenant-1/proposal.pdf'],
    ['/api/uploads/download?key=tenant-1%2Fproposal.pdf', 'key', 'tenant-1/proposal.pdf'],
    ['http://localhost:4000/api/uploads/download?path=%2Fuploads%2Ftenant-1%2Fproposal.pdf', 'path', '/uploads/tenant-1/proposal.pdf'],
  ])('downloads a stored document using an authenticated GET only: %s', async (reference, param, value) => {
    render(<FacultyResearchGrantDetails application={{ ...application, documents: { proposal: reference } }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Download proposal' }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(`http://localhost:4000/api/uploads/download?${param}=${encodeURIComponent(value)}`, expect.objectContaining({
      method: 'GET', headers: { Authorization: 'Bearer test-token', 'x-tenant-subdomain': 'sgvu' }, cache: 'no-store',
    }));
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:existing-document');
    expect(screen.getByRole('button', { name: 'Download proposal' })).toBeEnabled();
  });

  it('shows a download error and permits retry without changing the application', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false });
    render(<FacultyResearchGrantDetails application={{ ...application, documents: { proposal: '/uploads/tenant-1/proposal.pdf' } }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Download proposal' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Document could not be downloaded');
    expect(click).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Download proposal' }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
  });

  it('prevents duplicate downloads and aborts the old account response when switching accounts', async () => {
    let resolve!: (value: unknown) => void;
    fetchMock.mockReturnValue(new Promise(done => { resolve = done; }));
    const props = { ...application, documents: { proposal: '/uploads/tenant-1/proposal.pdf' } };
    const view = render(<FacultyResearchGrantDetails application={props} />);
    const button = screen.getByRole('button', { name: 'Download proposal' });
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    fixtures.auth = { user: { user_id: 'faculty-2', tenant_id: 'tenant-2' }, token: 'new-token' };
    view.rerender(<FacultyResearchGrantDetails application={props} />);
    expect(signal.aborted).toBe(true);
    await act(async () => { resolve({ ok: true, blob: async () => new Blob(['old response']) }); });
    expect(click).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Download proposal' })).toBeEnabled();
  });

  it('requires authentication for stored uploads without blocking safe external document references', () => {
    fixtures.auth.token = null;
    render(<FacultyResearchGrantDetails application={{ ...application, documents: { proposal: '/uploads/tenant-1/proposal.pdf', budget: 'https://example.org/budget.pdf' } }} />);
    expect(screen.getByRole('button', { name: 'Download proposal' })).toBeDisabled();
    expect(screen.getByText('Sign in to download uploaded documents.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open budget' })).toHaveAttribute('href', 'https://example.org/budget.pdf');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
