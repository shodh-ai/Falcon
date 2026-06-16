'use client';

import { useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { FinancePageHeader } from '@/components/finance/FinancePageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';

type Vendor = {
  vendor_id: string;
  business_name: string;
  gstin: string | null;
  default_tds_rate: string;
  bank_account_no: string | null;
  ifsc_code: string | null;
};

export default function FinanceVendorsPage() {
  const api = useAuthedApi();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [form, setForm] = useState({
    business_name: '',
    gstin: '',
    default_tds_rate: '2',
    bank_account_no: '',
    ifsc_code: '',
  });

  const load = () => void api.get<Vendor[]>('/finance/vendors').then(setVendors).catch(() => setVendors([]));

  useEffect(() => {
    load();
  }, [api]);

  async function save() {
    try {
      await api.post('/finance/vendors', { ...form, default_tds_rate: Number(form.default_tds_rate) });
      toast.success('Vendor saved');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <FinancePageHeader title="Vendor Master" description="Suppliers with GSTIN, bank details, and default TDS % for compliance." />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add vendor</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          <Input placeholder="Business name" value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} />
          <Input placeholder="GSTIN" value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} />
          <Input placeholder="Default TDS %" value={form.default_tds_rate} onChange={(e) => setForm({ ...form, default_tds_rate: e.target.value })} />
          <Input placeholder="Bank account" value={form.bank_account_no} onChange={(e) => setForm({ ...form, bank_account_no: e.target.value })} />
          <Input placeholder="IFSC" value={form.ifsc_code} onChange={(e) => setForm({ ...form, ifsc_code: e.target.value })} />
          <Button className="sm:col-span-2" onClick={() => void save()}>
            Save vendor
          </Button>
        </CardContent>
      </Card>
      {vendors.map((v) => (
        <Card key={v.vendor_id}>
          <CardContent className="p-4 text-sm">
            <p className="font-semibold">{v.business_name}</p>
            <p className="text-muted-foreground">
              GSTIN {v.gstin ?? '—'} · TDS {v.default_tds_rate}% · {v.bank_account_no ?? '—'} / {v.ifsc_code ?? '—'}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
