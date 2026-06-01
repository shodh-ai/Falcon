'use client';

import { useEffect, useState } from 'react';
import { FinancePageHeader } from '@/components/finance/FinancePageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';

type Account = { account_code: string; account_name: string; account_type: string };

export default function FinanceLedgerPage() {
  const api = useAuthedApi();
  const [accounts, setAccounts] = useState<Account[]>([]);

  useEffect(() => {
    void api.get<Account[]>('/finance/ledger-accounts').then(setAccounts).catch(() => setAccounts([]));
  }, [api]);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <FinancePageHeader
        title="Ledger Accounts"
        description="Chart of accounts for double-entry postings (fee receipts, expenses, payroll)."
      />
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <th className="p-3">Code</th>
                <th className="p-3">Account</th>
                <th className="p-3">Type</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.account_code} className="border-b">
                  <td className="p-3 font-mono">{a.account_code}</td>
                  <td className="p-3">{a.account_name}</td>
                  <td className="p-3">{a.account_type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
