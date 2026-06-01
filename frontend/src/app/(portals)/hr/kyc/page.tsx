'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { FalconLoader } from '@/components/brand/FalconLoader';
import { HrPageHeader } from '@/components/hr/HrPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';

type EmployeeRow = {
  user_id: string;
  name: string;
  employee_id: string | null;
};

export default function HrKycVaultPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api.get<EmployeeRow[]>('/api/hr/directory').then(setRows).finally(() => setLoading(false));
  }, [api]);

  if (loading) return <FalconLoader label="Loading KYC vault index…" />;

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <HrPageHeader
        title="KYC & Document Vault"
        description="PAN, Aadhaar, and bank details are AES-256 encrypted. Reveal actions are audit-logged per employee profile."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((r) => (
          <Card key={r.user_id}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Lock className="h-4 w-4 text-sgvu-gold" />
                {r.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p>ID: {r.employee_id ?? 'Pending assignment'}</p>
              <Link href={`/hr/employee/${r.user_id}?tab=kyc`} className="mt-2 inline-block text-sgvu-navy underline">
                Open secured profile tab
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
