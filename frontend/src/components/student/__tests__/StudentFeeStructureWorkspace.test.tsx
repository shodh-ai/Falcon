import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudentFeeStructureWorkspace } from '@/components/student/StudentFeeStructureWorkspace';

const mocks = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), getBlob: vi.fn() },
  financeGet: vi.fn(),
  attendanceGet: vi.fn(),
  now: Date.parse('2026-10-15T10:00:00+05:30'),
  financeEnabled: true,
  demoMode: false,
  error: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
  downloadPdf: vi.fn(),
  userId: 'synthetic-student',
  token: 'synthetic-token',
  createObjectURL: vi.fn(),
  revokeObjectURL: vi.fn(),
}));

vi.mock('@/lib/api', () => ({ useAuthedApi: () => mocks.api }));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: { user_id: mocks.userId, tenant_id: 'synthetic-tenant', name: 'Test Student', email: 'student@example.invalid' },
    token: mocks.token,
  }),
}));
vi.mock('@/components/student/useStudentClock', () => ({ useStudentClock: () => mocks.now }));
vi.mock('@/lib/student-demo-mode', () => ({ isStudentDemoModeEnabled: () => mocks.demoMode }));
vi.mock('@/lib/launch-modules', () => ({ isLaunchModuleEnabled: () => mocks.financeEnabled }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: { error: mocks.error, success: mocks.success, info: mocks.info } }));
vi.mock('@/lib/student/vault-pdf', () => ({ downloadVaultPdf: mocks.downloadPdf }));
vi.mock('@/components/finance/RazorpayCheckout', () => ({
  RazorpayCheckout: ({ order }: { order: { order_id: string; amount_inr: number } }) => (
    <div role="dialog" aria-label="Payment checkout">{order.order_id}: {order.amount_inr}</div>
  ),
}));
vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (value: string) => void; children: ReactNode }) => (
    <select aria-label="Select semester" value={value} onChange={(event) => onValueChange(event.target.value)}>{children}</select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => <option value={value}>{children}</option>,
}));

function fee(overrides: Record<string, unknown> = {}) {
  return {
    demand_id: 'tuition-demand', fee_head: 'tuition_fee', academic_year: '2026-2027', semester: 2,
    amount: 1000, fee_concession: 200, scholarship: 150, discount: 30, credit: 20,
    paid_amount: 200, payable_amount: 600, due_date: '2026-10-20', status: 'PARTIALLY_PAID',
    ...overrides,
  };
}

function payment(overrides: Record<string, unknown> = {}) {
  return {
    transaction_id: 'payment-semester-2', demand_id: 'tuition-demand', semester: 2, fee_head: 'tuition_fee',
    amount: '200.00', status: 'SUCCESS', payment_mode: 'CHEQUE', receipt_url: null,
    created_at: '2026-10-14T10:00:00+05:30', gateway_payment_id: 'SYNTHETIC-REFERENCE-2',
    ...overrides,
  };
}

function ledger(rows = [fee()], payments = [payment()]) {
  return {
    fee_structure: rows,
    pending_demands: rows.filter((row) => Number(row.payable_amount) > 0 && row.status !== 'WAIVED'),
    payment_history: payments,
    total_outstanding: rows.reduce((sum, row) => sum + Number(row.payable_amount), 0),
    gates: { admit_card_locked: true, no_dues_blocked: true, hostel_fines_pending: 0, message: 'Synthetic balance remains.' },
  };
}

function assignedSemesters(semesters: Array<number | string>) {
  return {
    subject_wise: semesters.map((semester) => ({ semester, status: 'ENROLLED' })),
    progression: Array.from({ length: 8 }, (_, index) => ({ semester: index + 1, status: 'UPCOMING' })),
  };
}

async function summary() {
  return screen.findByRole('region', { name: 'Fee summary' });
}

function expectSummaryValue(region: HTMLElement, label: string, value: string) {
  expect(within(region).getByText(label, { exact: true }).parentElement).toHaveTextContent(value);
}

beforeEach(() => {
  mocks.financeGet.mockReset().mockResolvedValue(ledger());
  mocks.attendanceGet.mockReset().mockResolvedValue({ subject_wise: [], progression: [] });
  mocks.api.get.mockReset().mockImplementation((path: string) => {
    if (path === '/api/student/finance') return mocks.financeGet();
    if (path === '/api/student/attendance') return mocks.attendanceGet();
    return Promise.reject(new Error(`Unexpected test request: ${path}`));
  });
  mocks.api.post.mockReset().mockResolvedValue({ order_id: 'test-order', amount_inr: 600, fee_head: 'tuition_fee', razorpay_key: 'sandbox_test' });
  mocks.api.getBlob.mockReset();
  mocks.now = Date.parse('2026-10-15T10:00:00+05:30');
  mocks.financeEnabled = true;
  mocks.demoMode = false;
  mocks.error.mockReset();
  mocks.success.mockReset();
  mocks.info.mockReset();
  mocks.downloadPdf.mockReset().mockResolvedValue(undefined);
  mocks.userId = 'synthetic-student';
  mocks.token = 'synthetic-token';
  mocks.createObjectURL.mockReset().mockReturnValue('blob:original-receipt');
  mocks.revokeObjectURL.mockReset();
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = mocks.createObjectURL;
    static revokeObjectURL = mocks.revokeObjectURL;
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Student fees and payments overview', () => {
  it('shows one plain-language total, paid amount, and outstanding balance without double-counting reductions', async () => {
    render(<StudentFeeStructureWorkspace />);
    const overview = await summary();
    expectSummaryValue(overview, 'Your total fees', '₹800.00');
    expectSummaryValue(overview, 'You have paid', '₹200.00');
    expectSummaryValue(overview, 'Amount left to pay', '₹600.00');
    expect(within(overview).getAllByText('Your total fees')).toHaveLength(1);
    expect(overview).toHaveTextContent('Original fees: ₹1,000.00 · Scholarships & adjustments: −₹200.00');
    expect(mocks.api.get).toHaveBeenCalledWith('/api/student/finance');
    expect(mocks.api.post).not.toHaveBeenCalled();
  });

  it('defaults to all semesters so older unpaid fees remain visible', async () => {
    mocks.financeGet.mockResolvedValue(ledger([
      fee(),
      fee({ demand_id: 'old-fee', semester: 1, amount: 500, fee_concession: 0, scholarship: 0, discount: 0, credit: 0, paid_amount: 100, payable_amount: 400, due_date: '2026-08-01' }),
    ]));
    render(<StudentFeeStructureWorkspace />);
    const overview = await summary();
    expect(screen.getByRole('combobox', { name: 'Select semester' })).toHaveValue('all');
    expectSummaryValue(overview, 'Your total fees', '₹1,300.00');
    expectSummaryValue(overview, 'You have paid', '₹300.00');
    expectSummaryValue(overview, 'Amount left to pay', '₹1,000.00');
  });

  it('updates all summary amounts when a specific semester is selected', async () => {
    mocks.financeGet.mockResolvedValue(ledger([
      fee(),
      fee({ demand_id: 'old-fee', semester: 1, amount: 500, fee_concession: 0, scholarship: 0, discount: 0, credit: 0, paid_amount: 500, payable_amount: 0, status: 'PAID' }),
    ]));
    render(<StudentFeeStructureWorkspace />);
    const overview = await summary();
    fireEvent.change(screen.getByRole('combobox', { name: 'Select semester' }), { target: { value: '1' } });
    expectSummaryValue(overview, 'Your total fees', '₹500.00');
    expectSummaryValue(overview, 'You have paid', '₹500.00');
    expectSummaryValue(overview, 'Amount left to pay', '₹0.00');
    expect(mocks.api.post).not.toHaveBeenCalled();
  });

  it('keeps genuine empty accounts empty even when demo mode is enabled', async () => {
    mocks.demoMode = true;
    mocks.financeGet.mockResolvedValue(ledger([], []));
    render(<StudentFeeStructureWorkspace />);
    expect(await screen.findByText('No fee records yet')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Fee summary' })).not.toBeInTheDocument();
    expect(mocks.api.post).not.toHaveBeenCalled();
  });

  it('shows a retryable error instead of made-up fees or a zero balance when loading fails', async () => {
    mocks.demoMode = true;
    mocks.financeGet.mockRejectedValueOnce(new Error('Finance unavailable')).mockResolvedValueOnce(ledger());
    render(<StudentFeeStructureWorkspace />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Fee summary' })).not.toBeInTheDocument();
    expect(screen.queryByText('No fee records yet')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Retry|Try again/i }));
    const overview = await summary();
    expectSummaryValue(overview, 'Amount left to pay', '₹600.00');
    expect(mocks.financeGet).toHaveBeenCalledTimes(2);
  });

  it('only creates an order for the exact fee selected by the student', async () => {
    mocks.financeGet.mockResolvedValue(ledger([
      fee(),
      fee({ demand_id: 'exam-demand', fee_head: 'examination_fee', amount: 300, fee_concession: 0, scholarship: 0, discount: 0, credit: 0, paid_amount: 0, payable_amount: 300 }),
    ]));
    mocks.api.post.mockResolvedValue({ order_id: 'exam-order', amount_inr: 300, fee_head: 'examination_fee', razorpay_key: 'sandbox_test' });
    render(<StudentFeeStructureWorkspace />);
    await summary();
    expect(mocks.api.post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Pay fees for Semester 2' }));
    const chooser = screen.getByRole('dialog', { name: 'Choose fee to pay' });
    expect(mocks.api.post).not.toHaveBeenCalled();
    fireEvent.click(within(chooser).getByRole('button', { name: 'Pay ₹300.00 for Examination Fee' }));
    await waitFor(() => expect(mocks.api.post).toHaveBeenCalledWith('/api/student/finance/pay/order', { demand_id: 'exam-demand' }));
    expect(mocks.api.post).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('dialog', { name: 'Payment checkout' })).toHaveTextContent('exam-order: 300');
  });

  it('never starts checkout for paid or waived fee demands', async () => {
    mocks.financeGet.mockResolvedValue(ledger([
      fee({ demand_id: 'paid-demand', status: 'PAID', paid_amount: 800, payable_amount: 600 }),
      fee({ demand_id: 'waived-demand', fee_head: 'waived_fee', status: 'WAIVED', paid_amount: 0, payable_amount: 1000 }),
    ]));
    render(<StudentFeeStructureWorkspace />);
    const overview = await summary();
    expectSummaryValue(overview, 'Amount left to pay', '₹0.00');
    expect(screen.queryByRole('button', { name: /^Pay fees|^Pay ₹/ })).not.toBeInTheDocument();
    expect(mocks.api.post).not.toHaveBeenCalled();
  });

  it('shows every recorded payment rather than cutting history off at five', async () => {
    mocks.financeGet.mockResolvedValue(ledger([fee()], Array.from({ length: 7 }, (_, index) => payment({
      transaction_id: `history-${index}`, fee_head: `historic_payment_${index + 1}`,
      created_at: `2026-10-${String(index + 1).padStart(2, '0')}T10:00:00+05:30`,
    }))));
    render(<StudentFeeStructureWorkspace />);
    await summary();
    expect(screen.getByRole('heading', { name: 'Payment history' })).toBeInTheDocument();
    for (let index = 1; index <= 7; index += 1) {
      expect(screen.getByText(`Historic Payment ${index}`, { exact: false })).toBeInTheDocument();
    }
  });

  it('filters payment history using its linked fee semester before legacy payment metadata', async () => {
    mocks.financeGet.mockResolvedValue(ledger([
      fee(),
      fee({ demand_id: 'semester-1-fee', semester: 1, fee_head: 'previous_tuition', paid_amount: 800, payable_amount: 0 }),
    ], [
      payment({ semester: 1, fee_head: 'current_semester_receipt' }),
      payment({ transaction_id: 'old-payment', demand_id: 'semester-1-fee', semester: 2, fee_head: 'previous_semester_receipt' }),
    ]));
    render(<StudentFeeStructureWorkspace />);
    await summary();
    fireEvent.change(screen.getByRole('combobox', { name: 'Select semester' }), { target: { value: '2' } });
    expect(screen.getByText('Current Semester Receipt', { exact: false })).toBeInTheDocument();
    expect(screen.queryByText('Previous Semester Receipt', { exact: false })).not.toBeInTheDocument();
  });

  it('keeps fees without a semester in overall totals but not in a semester view', async () => {
    mocks.financeGet.mockResolvedValue(ledger([
      fee(),
      fee({ demand_id: 'general-fee', semester: null, fee_head: 'general_fee', amount: 100, fee_concession: 0, scholarship: 0, discount: 0, credit: 0, paid_amount: 0, payable_amount: 100 }),
    ]));
    render(<StudentFeeStructureWorkspace />);
    const overview = await summary();
    expectSummaryValue(overview, 'Your total fees', '₹900.00');
    expect(screen.getByRole('row', { name: 'General fees' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Select semester' }), { target: { value: '2' } });
    expectSummaryValue(overview, 'Your total fees', '₹800.00');
    expect(screen.queryByRole('row', { name: 'General fees' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Semester 0' })).not.toBeInTheDocument();
  });

  it('does not mark a fee overdue before the end of its due date in India', async () => {
    mocks.now = Date.parse('2026-10-15T23:59:00+05:30');
    mocks.financeGet.mockResolvedValue(ledger([fee({ due_date: '2026-10-15' })], []));
    render(<StudentFeeStructureWorkspace />);
    await summary();
    expect(within(screen.getByRole('row', { name: 'Semester 2' })).queryByText('Overdue', { exact: true })).not.toBeInTheDocument();
  });

  it('marks a balance overdue once the next calendar day begins in India', async () => {
    mocks.now = Date.parse('2026-10-16T00:01:00+05:30');
    mocks.financeGet.mockResolvedValue(ledger([fee({ due_date: '2026-10-15' })], []));
    render(<StudentFeeStructureWorkspace />);
    await summary();
    expect(within(screen.getByRole('row', { name: 'Semester 2' })).getByText('Overdue', { exact: true })).toBeInTheDocument();
  });

  it('does not manufacture a fee receipt when no saved receipt is available', async () => {
    render(<StudentFeeStructureWorkspace />);
    await summary();
    expect(screen.getByText('Receipt unavailable', { exact: true })).toBeInTheDocument();
    expect(mocks.api.getBlob).not.toHaveBeenCalled();
    expect(mocks.downloadPdf).not.toHaveBeenCalled();
  });

  it('downloads the saved original receipt through the authenticated API', async () => {
    const original = new Blob(['%PDF-1.4 original receipt'], { type: 'application/pdf' });
    mocks.financeGet.mockResolvedValue(ledger([fee()], [payment({ receipt_url: '/uploads/synthetic-tenant/receipt.pdf' })]));
    mocks.api.getBlob.mockResolvedValue(original);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<StudentFeeStructureWorkspace />);
    await summary();
    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Download receipt for Tuition Fee on 14 Oct 2026' }));
    });
    expect(click).toHaveBeenCalledOnce();
    expect(mocks.api.getBlob).toHaveBeenCalledWith('/api/uploads/download?path=%2Fuploads%2Fsynthetic-tenant%2Freceipt.pdf');
    expect(mocks.createObjectURL).toHaveBeenCalledWith(original);
    const anchor = click.mock.instances[0];
    expect(anchor).toHaveAttribute('href', 'blob:original-receipt');
    expect(anchor).toHaveAttribute('download', 'fee-receipt-payment-semester-2.pdf');
    expect(mocks.downloadPdf).not.toHaveBeenCalled();
    // Run the real component's delayed cleanup while URL is still mocked.
    // Otherwise the callback escapes teardown and fails unrelated CI tests.
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith('blob:original-receipt');
  });

  it('reports a failed receipt download and never substitutes an invented receipt', async () => {
    mocks.financeGet.mockResolvedValue(ledger([fee()], [payment({ receipt_url: '/uploads/missing.pdf' })]));
    mocks.api.getBlob.mockRejectedValue(new Error('File not found'));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<StudentFeeStructureWorkspace />);
    await summary();
    const button = screen.getByRole('button', { name: 'Download receipt for Tuition Fee on 14 Oct 2026' });
    fireEvent.click(button);
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Could not download the original receipt. Please try again or contact Finance.'));
    expect(button).toBeEnabled();
    expect(mocks.createObjectURL).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
    expect(mocks.downloadPdf).not.toHaveBeenCalled();
  });

  it('does not send receipt authentication to an external URL', async () => {
    mocks.financeGet.mockResolvedValue(ledger([fee()], [payment({ receipt_url: 'https://untrusted.example/receipt.pdf' })]));
    render(<StudentFeeStructureWorkspace />);
    await summary();
    fireEvent.click(screen.getByRole('button', { name: 'Download receipt for Tuition Fee on 14 Oct 2026' }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledOnce());
    expect(mocks.api.getBlob).not.toHaveBeenCalled();
    expect(mocks.createObjectURL).not.toHaveBeenCalled();
  });

  it('rejects an error response returned as HTML instead of a receipt file', async () => {
    mocks.financeGet.mockResolvedValue(ledger([fee()], [payment({ receipt_url: '/uploads/broken.pdf' })]));
    mocks.api.getBlob.mockResolvedValue(new Blob(['<html>File not found</html>'], { type: 'text/html' }));
    render(<StudentFeeStructureWorkspace />);
    await summary();
    fireEvent.click(screen.getByRole('button', { name: 'Download receipt for Tuition Fee on 14 Oct 2026' }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledOnce());
    expect(mocks.createObjectURL).not.toHaveBeenCalled();
    expect(mocks.downloadPdf).not.toHaveBeenCalled();
  });

  it('clears the previous student balance immediately when the account changes', async () => {
    const view = render(<StudentFeeStructureWorkspace />);
    await summary();
    let resolveNewAccount!: (value: ReturnType<typeof ledger>) => void;
    mocks.financeGet.mockReturnValue(new Promise<ReturnType<typeof ledger>>((resolve) => { resolveNewAccount = resolve; }));
    mocks.userId = 'another-synthetic-student';
    mocks.token = 'another-token';
    view.rerender(<StudentFeeStructureWorkspace />);
    expect(screen.queryByRole('region', { name: 'Fee summary' })).not.toBeInTheDocument();
    expect(screen.queryByText('₹600.00', { exact: true })).not.toBeInTheDocument();
    await act(async () => resolveNewAccount(ledger([], [])));
    expect(await screen.findByText('No fee records yet')).toBeInTheDocument();
  });

  it('includes actual course semesters even when their fees have not been assigned', async () => {
    mocks.attendanceGet.mockResolvedValue(assignedSemesters([1, 2, 2]));
    render(<StudentFeeStructureWorkspace />);
    await summary();
    expect(mocks.api.get).toHaveBeenCalledWith('/api/student/attendance');
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['All semesters', 'Semester 1', 'Semester 2']);
    expect(screen.queryByRole('option', { name: 'Semester 8' })).not.toBeInTheDocument();
  });

  it.each([
    { courses: [3, 5], expected: ['All semesters', 'Semester 2', 'Semester 3', 'Semester 5'] },
    { courses: [1, 4, 9], expected: ['All semesters', 'Semester 1', 'Semester 2', 'Semester 4', 'Semester 9'] },
  ])('derives options from the actual assigned semester set $courses rather than a fixed program length', async ({ courses, expected }) => {
    mocks.attendanceGet.mockResolvedValue(assignedSemesters(courses));
    render(<StudentFeeStructureWorkspace />);
    await summary();
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(expected);
  });

  it('only includes valid positive integer semesters with real enrollment statuses', async () => {
    mocks.attendanceGet.mockResolvedValue({
      subject_wise: [
        { semester: 1, status: 'COMPLETED' }, { semester: '3', status: 'FAILED' },
        { semester: 5, status: 'ENROLLED' }, { semester: 5, status: 'ENROLLED' },
        { semester: 4, status: 'DROPPED' }, { semester: 6, status: 'PENDING' },
        { semester: 0, status: 'ENROLLED' }, { semester: -1, status: 'ENROLLED' },
        { semester: 1.5, status: 'ENROLLED' }, { semester: null, status: 'ENROLLED' },
        { semester: 'invalid', status: 'ENROLLED' },
      ],
    });
    render(<StudentFeeStructureWorkspace />);
    await summary();
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['All semesters', 'Semester 1', 'Semester 2', 'Semester 3', 'Semester 5']);
  });

  it('shows an honest not-yet-billed state for an assigned semester without claiming it is paid', async () => {
    mocks.attendanceGet.mockResolvedValue(assignedSemesters([1, 2]));
    render(<StudentFeeStructureWorkspace />);
    await summary();
    fireEvent.change(screen.getByRole('combobox', { name: 'Select semester' }), { target: { value: '1' } });
    expect(screen.getByText('No fees assigned yet')).toBeInTheDocument();
    expect(screen.getByText('No fees have been billed for Semester 1 yet. They will appear here when Finance assigns them.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Fee summary' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Pay fees|^Pay ₹/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/No fees left to pay|cleared/i)).not.toBeInTheDocument();
    expect(mocks.api.post).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('combobox', { name: 'Select semester' }), { target: { value: '2' } });
    expectSummaryValue(await summary(), 'Amount left to pay', '₹600.00');
    expect(screen.getByRole('button', { name: 'Pay fees for Semester 2' })).toBeEnabled();
  });

  it('keeps fee records usable when course metadata fails and retries only the semester list', async () => {
    mocks.attendanceGet.mockRejectedValueOnce(new Error('Course service unavailable')).mockResolvedValueOnce(assignedSemesters([1, 2]));
    render(<StudentFeeStructureWorkspace />);
    expectSummaryValue(await summary(), 'Amount left to pay', '₹600.00');
    expect(await screen.findByRole('status')).toHaveTextContent('The course semester list is unavailable. Semesters with fee records are still shown.');
    expect(screen.getByRole('option', { name: 'Semester 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pay fees for Semester 2' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry semester list' }));
    expect(await screen.findByRole('option', { name: 'Semester 1' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(mocks.attendanceGet).toHaveBeenCalledTimes(2);
    expect(mocks.financeGet).toHaveBeenCalledTimes(1);
  });

  it('does not hold the fee balance behind a stalled semester request and makes the timeout retryable', async () => {
    vi.useFakeTimers();
    mocks.attendanceGet.mockReturnValue(new Promise(() => {}));
    render(<StudentFeeStructureWorkspace />);
    await act(async () => { await Promise.resolve(); });
    expectSummaryValue(screen.getByRole('region', { name: 'Fee summary' }), 'Amount left to pay', '₹600.00');
    expect(screen.getByRole('option', { name: 'Semester 2' })).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(15_001); });
    expect(screen.getByRole('status')).toHaveTextContent('The course semester list is unavailable');
    expect(screen.getByRole('button', { name: 'Retry semester list' })).toBeEnabled();
    expectSummaryValue(screen.getByRole('region', { name: 'Fee summary' }), 'Amount left to pay', '₹600.00');
  });

  it('clears course semester choices on account change and ignores the old account’s late response', async () => {
    let resolveOldMetadata!: (value: ReturnType<typeof assignedSemesters>) => void;
    mocks.attendanceGet.mockReturnValueOnce(new Promise<ReturnType<typeof assignedSemesters>>((resolve) => { resolveOldMetadata = resolve; }));
    const view = render(<StudentFeeStructureWorkspace />);
    await summary();
    mocks.attendanceGet.mockResolvedValue(assignedSemesters([6]));
    mocks.userId = 'different-student';
    mocks.token = 'different-token';
    view.rerender(<StudentFeeStructureWorkspace />);
    expect(await screen.findByRole('option', { name: 'Semester 6' })).toBeInTheDocument();
    await act(async () => resolveOldMetadata(assignedSemesters([1, 4])));
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['All semesters', 'Semester 2', 'Semester 6']);
  });

  it('groups fee demands into one compact semester row with reconciled totals', async () => {
    mocks.financeGet.mockResolvedValue(ledger([
      fee(),
      fee({ demand_id: 'exam-demand', fee_head: 'examination_fee', amount: 300, fee_concession: 0, scholarship: 0, discount: 0, credit: 0, paid_amount: 100, payable_amount: 200 }),
    ], [payment(), payment({ transaction_id: 'exam-payment', demand_id: 'exam-demand', fee_head: 'examination_fee', amount: '100.00' })]));
    render(<StudentFeeStructureWorkspace />);
    await summary();
    const table = screen.getByRole('table', { name: 'Semester fees' });
    expect(within(table).getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['Semester', 'Total fee', 'Paid', 'Pending', 'Status', 'Action']);
    const row = within(table).getByRole('row', { name: 'Semester 2' });
    expect(within(row).getByText('₹1,100.00', { exact: true })).toBeInTheDocument();
    expect(within(row).getByText('₹300.00', { exact: true })).toBeInTheDocument();
    expect(within(row).getByText('₹800.00', { exact: true })).toBeInTheDocument();
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(mocks.api.post).not.toHaveBeenCalled();
  });

  it('filters the whole view when the semester name in the table is selected', async () => {
    mocks.financeGet.mockResolvedValue(ledger([
      fee(),
      fee({ demand_id: 'semester-one-fee', semester: 1, amount: 500, fee_concession: 0, scholarship: 0, discount: 0, credit: 0, paid_amount: 500, payable_amount: 0, status: 'PAID' }),
    ]));
    render(<StudentFeeStructureWorkspace />);
    const overview = await summary();
    fireEvent.click(screen.getByRole('button', { name: 'View fees for Semester 1' }));
    expect(screen.getByRole('combobox', { name: 'Select semester' })).toHaveValue('1');
    expectSummaryValue(overview, 'Your total fees', '₹500.00');
    expect(screen.getByRole('row', { name: 'Semester 1' })).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: 'Semester 2' })).not.toBeInTheDocument();
    expect(mocks.api.post).not.toHaveBeenCalled();
  });

  it('shows an assigned semester with no invoice as not assigned, with no payment action', async () => {
    mocks.attendanceGet.mockResolvedValue(assignedSemesters([1, 2]));
    render(<StudentFeeStructureWorkspace />);
    await summary();
    const row = screen.getByRole('row', { name: 'Semester 1' });
    expect(within(row).getByText('Not assigned', { exact: true })).toBeInTheDocument();
    expect(within(row).getAllByText('—', { exact: true }).length).toBeGreaterThanOrEqual(3);
    expect(within(row).queryByRole('button', { name: /^Pay fees/ })).not.toBeInTheDocument();
    expect(within(row).queryByText('Paid', { exact: true })).not.toBeInTheDocument();
  });

  it('opens a read-only detail dialog for a fully paid semester', async () => {
    mocks.financeGet.mockResolvedValue(ledger([fee({ paid_amount: 800, payable_amount: 0, status: 'PAID' })]));
    render(<StudentFeeStructureWorkspace />);
    await summary();
    fireEvent.click(screen.getByRole('button', { name: 'View fee details for Semester 2' }));
    const dialog = screen.getByRole('dialog', { name: 'Semester fee details' });
    expect(within(dialog).getByRole('article', { name: 'Tuition Fee' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /^Pay ₹/ })).not.toBeInTheDocument();
    expect(mocks.api.post).not.toHaveBeenCalled();
  });

  it('lists every original receipt for only the selected semester in the receipt dialog', async () => {
    mocks.financeGet.mockResolvedValue(ledger([
      fee(),
      fee({ demand_id: 'previous-demand', semester: 1, fee_head: 'previous_fee', paid_amount: 800, payable_amount: 0, status: 'PAID' }),
    ], [
      payment({ semester: 1, fee_head: 'tuition_installment_one', receipt_url: '/uploads/receipt-one.pdf' }),
      payment({ transaction_id: 'second-installment', fee_head: 'tuition_installment_two', receipt_url: '/uploads/receipt-two.pdf' }),
      payment({ transaction_id: 'previous-installment', demand_id: 'previous-demand', semester: 2, fee_head: 'previous_semester_receipt', receipt_url: '/uploads/old-receipt.pdf' }),
    ]));
    mocks.api.getBlob.mockResolvedValue(new Blob(['%PDF-1.4 original receipt'], { type: 'application/pdf' }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<StudentFeeStructureWorkspace />);
    await summary();
    fireEvent.click(screen.getByRole('button', { name: 'View receipts for Semester 2' }));
    const dialog = screen.getByRole('dialog', { name: 'Semester receipts' });
    expect(within(dialog).getByText('Tuition Installment One')).toBeInTheDocument();
    expect(within(dialog).getByText('Tuition Installment Two')).toBeInTheDocument();
    expect(within(dialog).queryByText('Previous Semester Receipt')).not.toBeInTheDocument();
    expect(mocks.api.getBlob).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Download receipt for Tuition Installment Two on 14 Oct 2026' }));
    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    expect(mocks.api.getBlob).toHaveBeenCalledWith('/api/uploads/download?path=%2Fuploads%2Freceipt-two.pdf');
    expect(mocks.api.post).not.toHaveBeenCalled();
  });

  it('keeps the selected fee dialog available for retry if checkout could not be started', async () => {
    mocks.api.post.mockRejectedValue(new Error('Payment provider unavailable'));
    render(<StudentFeeStructureWorkspace />);
    await summary();
    fireEvent.click(screen.getByRole('button', { name: 'Pay fees for Semester 2' }));
    const dialog = screen.getByRole('dialog', { name: 'Choose fee to pay' });
    const pay = within(dialog).getByRole('button', { name: 'Pay ₹600.00 for Tuition Fee' });
    fireEvent.click(pay);
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Payment provider unavailable'));
    expect(screen.getByRole('dialog', { name: 'Choose fee to pay' })).toBeInTheDocument();
    expect(pay).toBeEnabled();
    expect(screen.queryByRole('dialog', { name: 'Payment checkout' })).not.toBeInTheDocument();
    expect(mocks.api.post).toHaveBeenCalledTimes(1);
  });
});
