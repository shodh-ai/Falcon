'use client';

import { Select } from '@/components/ui/select';
import { useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { FinancePageHeader, formatInr } from '@/components/finance/FinancePageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';

type Head = { expense_head_id: string; head_name: string };
type Vendor = {
  vendor_id: string;
  business_name: string;
  default_tds_rate: string;
  gstin?: string | null;
};
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
    gst_rate: '0',
    department_id: '',
    po_id: '',
  });
  const [preview, setPreview] = useState<{ gst: number; tds: number; net: number } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = async () => {
    try {
      const [headRows, vendorRows, billRows, budgetRows] = await Promise.all([
        api.get<Head[]>('/finance/expense-heads'),
        api.get<Vendor[]>('/finance/vendors'),
        api.get<Bill[]>('/finance/expenses').catch(() => [] as Bill[]),
        api.get<Budget[]>('/finance/budgets').catch(() => [] as Budget[]),
      ]);
      setHeads(headRows);
      setVendors(vendorRows);
      setBills(billRows);
      setBudgets(budgetRows);
      setLoadError(null);
    } catch (e) {
      setHeads([]);
      setVendors([]);
      setBills([]);
      setBudgets([]);
      const msg = e instanceof Error ? e.message : 'Failed to load expense form';
      setLoadError(msg);
      toast.error(msg);
    }
  };

  useEffect(() => {
    void load();
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
        description="Log vendor invoices — GST input credit and TDS are computed from the vendor profile. Link the PO ID for 3-way match on AP Desk."
      />
      {loadError && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          {loadError}
        </div>
      )}
      {!loadError && !vendors.length && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          No vendors in master yet. Vendors are auto-created when Procurement saves quotes on a PR.
          Complete sourcing first, then refresh this page.
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Log bill</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          <Select className="rounded-md border px-3 py-2 text-sm" value={form.vendor_id} onChange={(e) => setForm({ ...form, vendor_id: e.target.value })}>
            <option value="">Select vendor</option>
            {vendors.map((v) => (
              <option key={v.vendor_id} value={v.vendor_id}>
                {v.business_name}
                {v.gstin ? ` (${v.gstin})` : ''}
              </option>
            ))}
          </Select>
          <Select className="rounded-md border px-3 py-2 text-sm" value={form.expense_head_id} onChange={(e) => setForm({ ...form, expense_head_id: e.target.value })}>
            <option value="">Expense head</option>
            {heads.map((h) => (
              <option key={h.expense_head_id} value={h.expense_head_id}>
                {h.head_name}
              </option>
            ))}
          </Select>
          <Input placeholder="Invoice number (vendor tax invoice ref — any unique ID for UAT)" value={form.invoice_number} onChange={(e) => setForm({ ...form, invoice_number: e.target.value })} />
          <Input type="date" value={form.invoice_date} onChange={(e) => setForm({ ...form, invoice_date: e.target.value })} />
          <Input placeholder="Taxable amount (₹)" type="number" value={form.taxable_amount} onChange={(e) => setForm({ ...form, taxable_amount: e.target.value })} />
          <Input
            placeholder="GST rate % (use 0 to match PO amount exactly)"
            type="number"
            min="0"
            step="0.01"
            value={form.gst_rate}
            onChange={(e) => setForm({ ...form, gst_rate: e.target.value })}
          />
          <Select className="rounded-md border px-3 py-2 text-sm" value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
            <option value="">Select Department (for budget allocation)</option>
            {budgets.map((b) => (
              <option key={b.budget_id} value={String(b.department_id)}>
                {b.department_name} (ID: {b.department_id})
              </option>
            ))}
          </Select>
          <Input placeholder="PO ID (Optional)" value={form.po_id} onChange={(e) => setForm({ ...form, po_id: e.target.value })} />
          {preview && (
            <p className="text-sm sm:col-span-2">
              GST {formatInr(preview.gst)} · TDS {formatInr(preview.tds)} ·{' '}
              <strong>Invoice total {formatInr(preview.net + preview.tds)}</strong> (must match PO
              amount on AP Desk)
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
