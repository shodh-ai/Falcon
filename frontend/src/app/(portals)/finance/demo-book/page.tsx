'use client';

import { useEffect, useState } from 'react';
import { FinancePageHeader, formatInr } from '@/components/finance/FinancePageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/context/AuthContext';
import { useAuthedApi } from '@/lib/api';

type DemoType = 'INVOICE' | 'EXPENSE' | 'PAYMENT' | 'JOURNAL';
type DemoRecord = {
  record_id: string;
  record_type: DemoType;
  reference: string;
  description: string;
  amount: string;
  status: string;
  occurred_on: string;
  details: Record<string, unknown>;
};
type DemoBook = {
  code: string;
  title: string;
  demo_only: true;
  disclaimer: string;
  records: DemoRecord[];
};

const groups: { type: DemoType; title: string; note: string }[] = [
  { type: 'INVOICE', title: 'Sample invoices', note: 'No vendor liability was created.' },
  { type: 'EXPENSE', title: 'Sample expenses', note: 'No expense was posted to the ledger.' },
  { type: 'PAYMENT', title: 'Sample payments', note: 'No gateway or bank movement occurred.' },
  { type: 'JOURNAL', title: 'Sample journals', note: 'Balanced examples, not posted journal entries.' },
];

export default function FinanceDemoBookPage() {
  const api = useAuthedApi();
  const { user, isLoading } = useAuth();
  const [book, setBook] = useState<DemoBook | null>(null);
  const [error, setError] = useState('');
  const allowed = user?.email?.toLowerCase() === 'finance@mygyanvihar.com';

  useEffect(() => {
    if (isLoading || !allowed) return;
    void api.get<DemoBook>('/finance/demo-book')
      .then(setBook)
      .catch(() => setError('The SGVU demo book is not available for this account.'));
  }, [api, allowed, isLoading]);

  if (!isLoading && !allowed) {
    return <p className="p-6 text-sm text-muted-foreground">This demo is not available for this account.</p>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <FinancePageHeader title="SGVU Finance demo book" description="Synthetic examples for presentation and training only." />
      <div role="alert" className="rounded-lg border-2 border-amber-500 bg-amber-50 p-4 text-sm font-semibold text-amber-950">
        DEMO ONLY — These records are not SGVU invoices, expenses, settled payments or official journal postings.
        They do not change balances, budgets, tax reports or bank reconciliation.
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {!book && !error && <p className="text-sm text-muted-foreground">Loading demo records…</p>}
      {book && (
        <>
          <p className="text-xs text-muted-foreground">Batch {book.code} · {book.records.length} synthetic records</p>
          {groups.map(({ type, title, note }) => {
            const rows = book.records.filter((record) => record.record_type === type);
            return (
              <Card key={type}>
                <CardHeader>
                  <CardTitle className="text-base">{title} ({rows.length})</CardTitle>
                  <p className="text-xs text-muted-foreground">{note}</p>
                </CardHeader>
                <CardContent className="overflow-x-auto p-0">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                      <tr><th className="p-3">Reference</th><th className="p-3">Date</th><th className="p-3">Description</th><th className="p-3">Amount</th><th className="p-3">State</th></tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.record_id} className="border-b">
                          <td className="p-3 font-mono text-xs">{row.reference}</td>
                          <td className="p-3">{row.occurred_on}</td>
                          <td className="p-3">{row.description}</td>
                          <td className="p-3 tabular-nums">{formatInr(row.amount)}</td>
                          <td className="p-3 text-xs font-semibold">{row.status.replaceAll('_', ' ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}
