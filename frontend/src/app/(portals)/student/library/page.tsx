'use client';

import { useCallback, useEffect, useState } from 'react';
import { BookMarked, RefreshCw } from 'lucide-react';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentSectionCard } from '@/components/student/StudentSectionCard';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';
import { LibraryOpacPanel } from '@/components/library/LibraryOpacPanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';
import { DEMO_LIBRARY_LOANS } from '@/lib/mock/student-portal-demo';
import { isStudentDemoModeEnabled } from '@/lib/student-demo-mode';
import { toast } from '@/lib/notifications/falcon-toast';
import { cn } from '@/lib/utils';

type LoanRow = {
  loan_id: string;
  title: string;
  author: string;
  accession_no: string;
  issue_date: string;
  due_date: string;
  fine_amount: number;
  renew_status: string;
  status: 'ISSUED' | 'OVERDUE' | 'RETURNED';
  transaction_id?: string;
};

type MyAccount = {
  active_loans?: Array<Record<string, unknown>>;
};

function formatDate(iso: string) {
  const value = iso.includes('T') ? iso : `${iso}T12:00:00`;
  return new Date(value).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function mapLoan(row: Record<string, unknown>): LoanRow {
  const due = String(row.due_date ?? '');
  const fine = Number(row.fine_amount ?? 0);
  const overdue =
    due && new Date(due.includes('T') ? due : `${due}T12:00:00`).getTime() < Date.now();
  const renewed = Number(row.renewed_count ?? 0);
  return {
    loan_id: String(row.loan_id ?? row.transaction_id ?? ''),
    transaction_id: String(row.transaction_id ?? row.loan_id ?? ''),
    title: String(row.title ?? 'Book'),
    author: String(row.author ?? '—'),
    accession_no: String(row.accession_no ?? row.accession_number ?? '—'),
    issue_date: String(row.issue_date ?? row.issued_at ?? '').slice(0, 10),
    due_date: due.slice(0, 10),
    fine_amount: fine,
    renew_status: renewed >= 2 ? 'Not allowed' : renewed > 0 ? 'Renewed' : 'Available',
    status: overdue ? 'OVERDUE' : 'ISSUED',
  };
}

export default function StudentLibraryOpacPage() {
  const api = useAuthedApi();
  const [loans, setLoans] = useState<LoanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [renewing, setRenewing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const account = await api.get<MyAccount>('/api/library/my-account');
      const rows = (account.active_loans ?? []).map(mapLoan);
      if (rows.length) {
        setLoans(rows);
      } else if (isStudentDemoModeEnabled()) {
        setLoans(DEMO_LIBRARY_LOANS);
      } else {
        setLoans([]);
      }
    } catch {
      setLoans(isStudentDemoModeEnabled() ? DEMO_LIBRARY_LOANS : []);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  async function renew(loan: LoanRow) {
    const id = loan.transaction_id || loan.loan_id;
    if (!id || id.startsWith('lib-')) {
      toast.error('Renew is available for live library loans only');
      return;
    }
    setRenewing(id);
    try {
      await api.post(`/api/library/renew/${id}`, {});
      toast.success('Book renewed');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Renew failed');
    } finally {
      setRenewing(null);
    }
  }

  return (
    <StudentPageShell width="6xl">
      <StudentPageHeader
        title="Library"
        description="Search the Falcon catalog, manage loans, place holds, and access e-resources."
      />

      <StudentSectionCard
        title="My issued books"
        description="Current loans with due dates, fines, and renew status"
        icon={BookMarked}
      >
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading loans…</p>
        ) : loans.length === 0 ? (
          <StudentEmptyState
            title="No issued books"
            description="Books you borrow will appear here with due dates and renew options."
          />
        ) : (
          <>
            <div className="space-y-3 md:hidden">
              {loans.map((loan) => (
                <div
                  key={`${loan.loan_id}-card`}
                  className="rounded-xl border border-sgvu-navy/10 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-sgvu-navy">{loan.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {loan.author} · {loan.accession_no}
                      </p>
                    </div>
                    <Badge
                      className={cn(
                        'shrink-0 border-transparent',
                        loan.status === 'OVERDUE' ? 'bg-destructive text-white' : 'bg-sgvu-navy text-white',
                      )}
                    >
                      {loan.status === 'OVERDUE' ? 'Overdue' : 'Issued'}
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-slate-50 px-2.5 py-2">
                      <p className="text-muted-foreground">Issued</p>
                      <p className="font-semibold text-sgvu-navy">{formatDate(loan.issue_date)}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-2.5 py-2">
                      <p className="text-muted-foreground">Due</p>
                      <p className="font-semibold text-sgvu-navy">{formatDate(loan.due_date)}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-2.5 py-2">
                      <p className="text-muted-foreground">Fine</p>
                      <p
                        className={cn(
                          'font-semibold',
                          loan.fine_amount > 0 ? 'text-destructive' : 'text-sgvu-navy',
                        )}
                      >
                        ₹{loan.fine_amount}
                      </p>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-2.5 py-2">
                      <p className="text-muted-foreground">Renew</p>
                      <p className="font-semibold text-sgvu-navy">{loan.renew_status}</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3 w-full"
                    disabled={
                      renewing === (loan.transaction_id || loan.loan_id) ||
                      loan.renew_status === 'Not allowed'
                    }
                    onClick={() => void renew(loan)}
                  >
                    <RefreshCw className="mr-1 h-3.5 w-3.5" />
                    Renew
                  </Button>
                </div>
              ))}
            </div>
            <div className="hidden overflow-x-auto rounded-xl border border-sgvu-navy/10 md:block">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-semibold">Book</th>
                    <th className="px-4 py-3 font-semibold">Issue date</th>
                    <th className="px-4 py-3 font-semibold">Due date</th>
                    <th className="px-4 py-3 font-semibold">Fine</th>
                    <th className="px-4 py-3 font-semibold">Renew</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loans.map((loan) => (
                    <tr key={loan.loan_id} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-sgvu-navy">{loan.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {loan.author} · {loan.accession_no}
                        </p>
                      </td>
                      <td className="px-4 py-3">{formatDate(loan.issue_date)}</td>
                      <td className="px-4 py-3">{formatDate(loan.due_date)}</td>
                      <td className="px-4 py-3 font-semibold">
                        {loan.fine_amount > 0 ? (
                          <span className="text-destructive">₹{loan.fine_amount}</span>
                        ) : (
                          '₹0'
                        )}
                      </td>
                      <td className="px-4 py-3">{loan.renew_status}</td>
                      <td className="px-4 py-3">
                        <Badge
                          className={cn(
                            'border-transparent',
                            loan.status === 'OVERDUE'
                              ? 'bg-destructive text-white'
                              : 'bg-sgvu-navy text-white',
                          )}
                        >
                          {loan.status === 'OVERDUE' ? 'Overdue' : 'Issued'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={
                            renewing === (loan.transaction_id || loan.loan_id) ||
                            loan.renew_status === 'Not allowed'
                          }
                          onClick={() => void renew(loan)}
                        >
                          <RefreshCw className="mr-1 h-3.5 w-3.5" />
                          Renew
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </StudentSectionCard>

      <LibraryOpacPanel
        basePath="/student/library"
        title="Student library"
        description="Search the Falcon catalog, place holds, and manage your loans."
        embedded
      />
    </StudentPageShell>
  );
}
