'use client';

import { Select } from '@/components/ui/select';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from '@/lib/notifications/falcon-toast';
import { FinancePageHeader, formatInr } from '@/components/finance/FinancePageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';
import { createOperationsApi } from '@/lib/api/api.operations';
import {
  formatPoOptionLabel,
  shortPoId,
  type PurchaseOrderRow,
} from '@/lib/finance/purchase-order-display';

type Head = { expense_head_id: string; head_name: string };
type Vendor = {
  vendor_id: string;
  business_name: string;
  default_tds_rate: string;
  gstin?: string | null;
};
type Bill = {
  invoice_id: string;
  vendor_name: string;
  head_name: string;
  invoice_number?: string;
  invoice_date?: string;
  po_id?: string;
  status?: string;
  taxable_amount?: string;
  total_amount: string;
  net_payable: string;
  gst_amount: string;
  tds_amount: string;
};
type Budget = { budget_id: string; department_id: number; department_name: string };

export default function FinanceExpensesPage() {
  const api = useAuthedApi();
  const ops = useMemo(() => createOperationsApi(api), [api]);
  const searchParams = useSearchParams();
  const preselectedPoId = searchParams.get('po_id') ?? '';

  const [heads, setHeads] = useState<Head[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [approvedPos, setApprovedPos] = useState<PurchaseOrderRow[]>([]);
  const [form, setForm] = useState({
    vendor_id: '',
    expense_head_id: '',
    invoice_number: '',
    invoice_date: '',
    taxable_amount: '',
    gst_rate: '0',
    department_id: '',
    po_id: '',
  });
  const [preview, setPreview] = useState<{ gst: number; tds: number; net: number } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const selectedPo = approvedPos.find((p) => p.po_id === form.po_id);

  const load = async () => {
    try {
      const [headRows, vendorRows, billRows, budgetRows, poRows] = await Promise.all([
        api.get<Head[]>('/finance/expense-heads'),
        api.get<Vendor[]>('/finance/vendors'),
        api.get<Bill[]>('/finance/expenses').catch(() => [] as Bill[]),
        api.get<Budget[]>('/finance/budgets').catch(() => [] as Budget[]),
        ops.purchaseOrders().catch(() => [] as PurchaseOrderRow[]),
      ]);
      setHeads(headRows);
      setVendors(vendorRows);
      setBills(billRows);
      setBudgets(budgetRows);
      setApprovedPos(
        (Array.isArray(poRows) ? poRows : []).filter((p) => p.status === 'APPROVED' && p.source_system !== 'MODULE2'),
      );
      setLoadError(null);
    } catch (e) {
      setHeads([]);
      setVendors([]);
      setBills([]);
      setBudgets([]);
      setApprovedPos([]);
      const msg = e instanceof Error ? e.message : 'Failed to load expense form';
      setLoadError(msg);
      toast.error(msg);
    }
  };

  useEffect(() => {
    void load();
  }, [api, ops]);

  useEffect(() => {
    if (!preselectedPoId || form.po_id) return;
    setForm((prev) => ({ ...prev, po_id: preselectedPoId }));
  }, [preselectedPoId, form.po_id]);

  useEffect(() => {
    if (!form.po_id || form.taxable_amount) return;
    const po = approvedPos.find((p) => p.po_id === form.po_id);
    if (po?.amount != null) {
      setForm((prev) => ({ ...prev, taxable_amount: String(Number(po.amount)) }));
    }
  }, [form.po_id, form.taxable_amount, approvedPos]);

  useEffect(() => {
    const vendor = vendors.find((v) => v.vendor_id === form.vendor_id);
    const taxable = Number(form.taxable_amount || 0);
    const gst = (taxable * Number(form.gst_rate)) / 100;
    const tds = (taxable * Number(vendor?.default_tds_rate ?? 0)) / 100;
    setPreview({ gst, tds, net: taxable + gst - tds });
  }, [form, vendors]);

  function onPoChange(poId: string) {
    const po = approvedPos.find((p) => p.po_id === poId);
    setForm((prev) => ({
      ...prev,
      po_id: poId,
      taxable_amount: po?.amount != null ? String(Number(po.amount)) : prev.taxable_amount,
      gst_rate: '0',
    }));
  }

  async function submit() {
    try {
      if (!form.vendor_id || !form.expense_head_id || !form.taxable_amount || !form.invoice_number.trim() || !form.invoice_date) {
        throw new Error('Vendor, expense head, invoice number, invoice date and taxable amount are required');
      }
      if (!form.po_id) {
        throw new Error(
          'Select a legacy purchase order. For Module 2 purchase orders, enter the invoice in Progressive Procurement.',
        );
      }
      await api.post('/finance/expenses', {
        ...form,
        taxable_amount: Number(form.taxable_amount),
        gst_rate: Number(form.gst_rate),
        department_id: form.department_id ? Number(form.department_id) : undefined,
        po_id: form.po_id,
      });
      toast.success('Bill logged — return to AP Desk to pay');
      setForm((prev) => ({
        ...prev,
        invoice_number: '',
        taxable_amount: '',
        po_id: '',
      }));
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <FinancePageHeader
        title="Expense Heads & Bills"
        description="Log vendor invoices and link an approved PO so AP Desk can run 3-way match (PO + GRN + invoice) before payment."
      />
      {loadError && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          {loadError}
        </div>
      )}
      {!loadError && !vendors.length && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          No vendors in master yet. Vendors are auto-created when Procurement saves quotes on a PR,
          or seeded for catalog items (SGVU Preferred Supplies).
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Log bill</CardTitle>
          <p className="text-xs text-muted-foreground">This form is for legacy purchase orders only. For a Progressive Procurement (Module 2) order, upload the invoice in <Link className="underline" href="/finance/procurements">Progressive Procurement</Link>; its approved invoice flows to AP Desk.</p>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          <Select
            className="rounded-md border px-3 py-2 text-sm sm:col-span-2"
            value={form.po_id}
            onChange={(e) => onPoChange(e.target.value)}
          >
            <option value="">Select approved legacy PO (required for payment)</option>
            {approvedPos.map((p) => (
              <option key={p.po_id} value={p.po_id}>
                {formatPoOptionLabel(p)}
              </option>
            ))}
          </Select>
          {selectedPo && (
            <p className="text-xs text-muted-foreground sm:col-span-2">
              PO ID <span className="font-mono">{selectedPo.po_id}</span> — invoice total must
              equal ₹{Number(selectedPo.amount ?? 0).toLocaleString('en-IN')} (use GST rate 0% if PO
              has no tax).
            </p>
          )}
          <Select
            className="rounded-md border px-3 py-2 text-sm"
            value={form.vendor_id}
            onChange={(e) => setForm({ ...form, vendor_id: e.target.value })}
          >
            <option value="">Select vendor</option>
            {vendors.map((v) => (
              <option key={v.vendor_id} value={v.vendor_id}>
                {v.business_name}
                {v.gstin ? ` (${v.gstin})` : ''}
              </option>
            ))}
          </Select>
          <Select
            className="rounded-md border px-3 py-2 text-sm"
            value={form.expense_head_id}
            onChange={(e) => setForm({ ...form, expense_head_id: e.target.value })}
          >
            <option value="">Expense head (required)</option>
            {heads.map((h) => (
              <option key={h.expense_head_id} value={h.expense_head_id}>
                {h.head_name}
              </option>
            ))}
          </Select>
          <Input
            placeholder="Invoice number (vendor tax invoice ref)"
            value={form.invoice_number}
            onChange={(e) => setForm({ ...form, invoice_number: e.target.value })}
          />
          <label className="grid gap-1 text-sm">Invoice date (shown on vendor invoice)
            <Input type="date" value={form.invoice_date} onChange={(e) => setForm({ ...form, invoice_date: e.target.value })} required />
          </label>
          <Input
            placeholder="Taxable amount (₹)"
            type="number"
            value={form.taxable_amount}
            onChange={(e) => setForm({ ...form, taxable_amount: e.target.value })}
          />
          <Input
            placeholder="GST rate % (use 0 to match PO amount)"
            type="number"
            min="0"
            step="0.01"
            value={form.gst_rate}
            onChange={(e) => setForm({ ...form, gst_rate: e.target.value })}
          />
          <Select
            className="rounded-md border px-3 py-2 text-sm sm:col-span-2"
            value={form.department_id}
            onChange={(e) => setForm({ ...form, department_id: e.target.value })}
          >
            <option value="">Department (optional — budget allocation)</option>
            {budgets.map((b) => (
              <option key={b.budget_id} value={String(b.department_id)}>
                {b.department_name} (ID: {b.department_id})
              </option>
            ))}
          </Select>
          {preview && (
            <p className="text-sm sm:col-span-2">
              GST {formatInr(preview.gst)} · TDS {formatInr(preview.tds)} ·{' '}
              <strong>Invoice total {formatInr(preview.net + preview.tds)}</strong>
              {selectedPo
                ? ` (PO amount ₹${Number(selectedPo.amount ?? 0).toLocaleString('en-IN')})`
                : null}
            </p>
          )}
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button onClick={() => void submit()}>Log legacy bill</Button>
            {form.po_id ? (
              <Button variant="secondary" asChild>
                <Link href="/finance/ap-desk">Go to AP Desk</Link>
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
      {bills.map((b) => (
        <Card key={b.invoice_id}>
          <CardContent className="p-4 text-sm">
            <details>
              <summary className="cursor-pointer font-semibold">{b.vendor_name} · {b.head_name} · Total {formatInr(b.total_amount)} · Net {formatInr(b.net_payable)} <span className="text-xs font-normal underline">View details</span></summary>
              <dl className="mt-3 grid gap-1 text-muted-foreground sm:grid-cols-2">
                <div>Invoice: {b.invoice_number || 'Not recorded'}</div>
                <div>Date: {b.invoice_date || 'Not recorded'}</div>
                <div>PO: {b.po_id || 'Not linked'}</div>
                <div>Status: {b.status || 'Not recorded'}</div>
                <div>Taxable: {formatInr(b.taxable_amount)}</div>
                <div>GST: {formatInr(b.gst_amount)}</div>
                <div>TDS: {formatInr(b.tds_amount)}</div>
                <div>Net payable: {formatInr(b.net_payable)}</div>
              </dl>
            </details>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
