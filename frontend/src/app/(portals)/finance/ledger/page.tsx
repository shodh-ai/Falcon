'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FinancePageHeader } from '@/components/finance/FinancePageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';

type Account = {
  account_code: string;
  account_name: string;
  account_type: string;
  debit: string;
  credit: string;
  balance?: string;
};
type Book = { legal_name: string; base_currency: string; authority_status: string };
type TrialBalance = {
  book: Book;
  status: string;
  ledger_revision: string;
  accounts: Account[];
  total_debit: string;
  total_credit: string;
  balanced: boolean;
};
type IncomeExpenditure = {
  fiscal_start: string;
  income: Account[];
  expenses: Account[];
  surplus: string;
};
type BalanceSheet = {
  assets: Account[];
  liabilities: Account[];
  funds: Account[];
  current_surplus: string;
  prior_surplus: string;
  total_assets: string;
  total_liabilities_and_funds: string;
  balanced: boolean;
};

function amount(value: string | undefined) {
  const number = Number(value ?? 0);
  return Number.isFinite(number)
    ? number.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—';
}

function AccountTable({ rows, balance = false }: { rows: Account[]; balance?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <th className="p-3">Code</th><th className="p-3">Account</th>
            <th className="p-3">Type</th>
            {balance ? <th className="p-3 text-right">Balance (₹)</th> : <>
              <th className="p-3 text-right">Debit (₹)</th><th className="p-3 text-right">Credit (₹)</th>
            </>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.account_code} className="border-b">
              <td className="p-3 font-mono">{row.account_code}</td>
              <td className="p-3">{row.account_name}</td>
              <td className="p-3">{row.account_type}</td>
              {balance ? <td className="p-3 text-right tabular-nums">{amount(row.balance)}</td> : <>
                <td className="p-3 text-right tabular-nums">{amount(row.debit)}</td>
                <td className="p-3 text-right tabular-nums">{amount(row.credit)}</td>
              </>}
            </tr>
          ))}
          {rows.length === 0 && <tr><td className="p-3 text-muted-foreground" colSpan={5}>No canonical postings yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export default function FinanceLedgerPage() {
  const api = useAuthedApi();
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [trial, setTrial] = useState<TrialBalance | null>(null);
  const [income, setIncome] = useState<IncomeExpenditure | null>(null);
  const [sheet, setSheet] = useState<BalanceSheet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const query = `?as_of=${encodeURIComponent(asOf)}`;
    api.get<TrialBalance>(`/api/finance/accounting/v1/reports/trial-balance${query}`).then(async (trialResult) => {
      const pinned = `${query}&ledger_revision=${encodeURIComponent(trialResult.ledger_revision)}`;
      const [incomeResult, sheetResult] = await Promise.all([
        api.get<IncomeExpenditure>(`/api/finance/accounting/v1/reports/income-expenditure${pinned}`),
        api.get<BalanceSheet>(`/api/finance/accounting/v1/reports/balance-sheet${pinned}`),
      ]);
      if (!cancelled) { setTrial(trialResult); setIncome(incomeResult); setSheet(sheetResult); }
    }).catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load accounting reports');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [api, asOf]);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <FinancePageHeader title="General Ledger & Statements" description="Tenant-specific accounting book. Figures remain provisional until opening balances and close controls are approved." />
      <div className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
        <label htmlFor="ledger-date" className="text-sm font-medium">As of date</label>
        <Input id="ledger-date" type="date" value={asOf} onChange={(event) => {
          setAsOf(event.target.value); setLoading(true); setError(null);
          setTrial(null); setIncome(null); setSheet(null);
        }} className="w-44" />
        {trial && <span className="text-sm text-muted-foreground">{trial.book.legal_name} · {trial.book.base_currency} · {trial.status} · Revision {trial.ledger_revision}</span>}
      </div>
      {loading && <p role="status">Loading accounting reports…</p>}
      {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-800">{error}</p>}
      {trial && !loading && <>
        <Card>
          <CardHeader><CardTitle>Trial balance</CardTitle></CardHeader>
          <CardContent className="p-0">
            <AccountTable rows={trial.accounts} />
            <p className="p-3 text-sm font-medium">Total debit ₹{amount(trial.total_debit)} · Total credit ₹{amount(trial.total_credit)} · {trial.balanced ? 'Balanced' : 'Out of balance — review required'}</p>
          </CardContent>
        </Card>
        {income && <Card>
          <CardHeader><CardTitle>Income and expenditure · from {income.fiscal_start}</CardTitle></CardHeader>
          <CardContent className="space-y-4 p-0">
            <AccountTable rows={income.income} balance />
            <AccountTable rows={income.expenses} balance />
            <p className="p-3 text-sm font-medium">Current-year surplus / (deficit): ₹{amount(income.surplus)}</p>
          </CardContent>
        </Card>}
        {sheet && <Card>
          <CardHeader><CardTitle>Balance sheet · as of {asOf}</CardTitle></CardHeader>
          <CardContent className="space-y-4 p-0">
            <AccountTable rows={sheet.assets} balance />
            <AccountTable rows={sheet.liabilities} balance />
            <AccountTable rows={sheet.funds} balance />
            <p className="p-3 text-sm font-medium">Prior surplus ₹{amount(sheet.prior_surplus)} · Current-year surplus ₹{amount(sheet.current_surplus)}<br />Assets ₹{amount(sheet.total_assets)} · Liabilities and funds ₹{amount(sheet.total_liabilities_and_funds)} · {sheet.balanced ? 'Balanced' : 'Out of balance — review required'}</p>
          </CardContent>
        </Card>}
      </>}
      <p className="text-sm text-muted-foreground">Historical Finance CSV exports remain under <Link href="/finance/audit-reports" className="underline">Audit Reports</Link>; they are not audited statements.</p>
    </div>
  );
}
