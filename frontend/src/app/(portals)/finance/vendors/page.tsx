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
  contact_email: string | null;
  gstin: string | null;
  pan_number: string | null;
  default_tds_rate: string;
  bank_account_no: string | null;
  ifsc_code: string | null;
};

export default function FinanceVendorsPage() {
  const api = useAuthedApi();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    business_name: '',
    contact_email: '',
    gstin: '',
    pan_number: '',
    default_tds_rate: '',
    bank_account_no: '',
    ifsc_code: '',
  });

  const load = () => void api.get<Vendor[]>('/finance/vendors').then(setVendors).catch(() => setVendors([]));

  useEffect(() => {
    load();
  }, [api]);

  async function save() {
    if (!form.business_name.trim()) {
      toast.error('Business name is required');
      return;
    }
    try {
      const payload = { ...form, default_tds_rate: form.default_tds_rate === '' ? 0 : Number(form.default_tds_rate) };
      if (editingId) await api.patch(`/finance/vendors/${editingId}`, payload);
      else await api.post('/finance/vendors', payload);
      toast.success('Vendor saved');
      setEditingId(null);
      setForm({ business_name: '', contact_email: '', gstin: '', pan_number: '', default_tds_rate: '', bank_account_no: '', ifsc_code: '' });
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
          <CardTitle className="text-base">{editingId ? 'Edit vendor' : 'Add vendor'}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          <Input placeholder="Business name" value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} />
          <Input placeholder="Contact email (optional)" type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
          <Input placeholder="GSTIN" value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} />
          <Input placeholder="PAN (optional)" value={form.pan_number} onChange={(e) => setForm({ ...form, pan_number: e.target.value })} />
          <Input placeholder="Default TDS % (0 if none)" type="number" min="0" max="100" step="0.01" value={form.default_tds_rate} onChange={(e) => setForm({ ...form, default_tds_rate: e.target.value })} />
          <Input placeholder="Bank account" value={form.bank_account_no} onChange={(e) => setForm({ ...form, bank_account_no: e.target.value })} />
          <Input placeholder="IFSC" value={form.ifsc_code} onChange={(e) => setForm({ ...form, ifsc_code: e.target.value })} />
          <Button className="sm:col-span-2" onClick={() => void save()}>
            {editingId ? 'Update vendor' : 'Save vendor'}
          </Button>
          <p className="sm:col-span-2 text-xs text-muted-foreground">TDS is not assumed. Enter the applicable rate only after confirming the vendor and tax category.</p>
        </CardContent>
      </Card>
      {vendors.map((v) => (
        <Card key={v.vendor_id}>
          <CardContent className="p-4 text-sm">
            <p className="font-semibold">{v.business_name}</p>
            <p className="text-muted-foreground">
              GSTIN {v.gstin ?? '—'} · TDS {v.default_tds_rate}% · {v.bank_account_no ?? '—'} / {v.ifsc_code ?? '—'}
            </p>
            <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => {
              setEditingId(v.vendor_id);
              setForm({ business_name: v.business_name, contact_email: v.contact_email ?? '', gstin: v.gstin ?? '', pan_number: v.pan_number ?? '', default_tds_rate: String(v.default_tds_rate ?? ''), bank_account_no: v.bank_account_no ?? '', ifsc_code: v.ifsc_code ?? '' });
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}>Edit vendor</Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
