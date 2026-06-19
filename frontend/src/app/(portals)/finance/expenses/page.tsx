'use client';

import { useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { FinancePageHeader, formatInr } from '@/components/finance/FinancePageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';

type Head = { expense_head_id: string; head_name: string };
type Vendor = { vendor_id: string; business_name: string; default_tds_rate: string };
type Bill = { invoice_id: string; vendor_name: string; head_name: string; total_amount: string; net_payable: string; gst_amount: string; tds_amount: string };
type Budget = { budget_id: string; department_id: number; department_name: string };

export default function FinanceExpensesPage() {
  const api = useAuthedApi();
  const [heads, setHeads] = useState<Head[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [form, setForm] = useState({
    vendor_id: '',
    expense_head_id: '',
    invoice_number: '',
    invoice_date: new Date().toISOString().slice(0, 10),
    taxable_amount: '',
    gst_rate: '18',
    department_id: '',
    po_id: '',
  });
  const [preview, setPreview] = useState<{ gst: number; tds: number; net: number } | null>(null);

  const load = () => {
    void api.get<Head[]>('/finance/expense-heads').then(setHeads);
    void api.get<Vendor[]>('/finance/vendors').then(setVendors);
    void api.get<Bill[]>('/finance/expenses').then(setBills).catch(() => setBills([]));
    void api.get<Budget[]>('/finance/budgets').then(setBudgets).catch(() => setBudgets([]));
  };

  useEffect(() => {
    load();
  }, [api]);

  useEffect(() => {
    const vendor = vendors.find((v) => v.vendor_id === form.vendor_id);
    const taxable = Number(form.taxable_amount || 0);
    const gst = (taxable * Number(form.gst_rate)) / 100;
    const tds = (taxable * Number(vendor?.default_tds_rate ?? 0)) / 100;
    setPreview({ gst, tds, net: taxable + gst - tds });
  }, [form, vendors]);

  async function submit() {
    try {
      if (!form.vendor_id || !form.expense_head_id || !form.taxable_amount) {
        throw new Error('Please fill all required fields');
      }
      await api.post('/finance/expenses', {
        ...form,
        taxable_amount: Number(form.taxable_amount),
        gst_rate: Number(form.gst_rate),
        department_id: form.department_id ? Number(form.department_id) : undefined,
        po_id: form.po_id || undefined,
      });
      toast.success('Bill approved with GST/TDS');
      setForm(prev => ({ ...prev, invoice_number: '', taxable_amount: '', po_id: '' }));
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <FinancePageHeader
        title="Expense Heads & Bills"
        description="Log vendor invoices — GST input credit and TDS are computed from the vendor profile."
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Log bill</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          <select className="rounded-md border px-3 py-2 text-sm" value={form.vendor_id} onChange={(e) => setForm({ ...form, vendor_id: e.target.value })}>
            <option value="">Select vendor</option>
            {vendors.map((v) => (
              <option key={v.vendor_id} value={v.vendor_id}>
                {v.business_name}
              </option>
            ))}
          </select>
          <select className="rounded-md border px-3 py-2 text-sm" value={form.expense_head_id} onChange={(e) => setForm({ ...form, expense_head_id: e.target.value })}>
            <option value="">Expense head</option>
            {heads.map((h) => (
              <option key={h.expense_head_id} value={h.expense_head_id}>
                {h.head_name}
              </option>
            ))}
          </select>
          <Input placeholder="Invoice number" value={form.invoice_number} onChange={(e) => setForm({ ...form, invoice_number: e.target.value })} />
          <Input type="date" value={form.invoice_date} onChange={(e) => setForm({ ...form, invoice_date: e.target.value })} />
          <Input placeholder="Taxable amount (₹)" type="number" value={form.taxable_amount} onChange={(e) => setForm({ ...form, taxable_amount: e.target.value })} />
          <select className="rounded-md border px-3 py-2 text-sm" value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
            <option value="">Select Department (for budget allocation)</option>
            {budgets.map((b) => (
              <option key={b.budget_id} value={String(b.department_id)}>
                {b.department_name} (ID: {b.department_id})
              </option>
            ))}
          </select>
          <Input placeholder="PO ID (Optional)" value={form.po_id} onChange={(e) => setForm({ ...form, po_id: e.target.value })} />
          {preview && (
            <p className="text-sm sm:col-span-2">
              GST {formatInr(preview.gst)} · TDS {formatInr(preview.tds)} · <strong>Net payable {formatInr(preview.net)}</strong>
            </p>
          )}
          <Button className="sm:col-span-2" onClick={() => void submit()}>
            Approve bill
          </Button>
        </CardContent>
      </Card>
      {bills.map((b) => (
        <Card key={b.invoice_id}>
          <CardContent className="p-4 text-sm">
            <p className="font-semibold">{b.vendor_name}</p>
            <p className="text-muted-foreground">
              {b.head_name} · Total {formatInr(b.total_amount)} · Net {formatInr(b.net_payable)}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
