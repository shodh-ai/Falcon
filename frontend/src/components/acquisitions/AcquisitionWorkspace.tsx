'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Plus, ShieldCheck, Upload, X } from 'lucide-react';
import { useAuthedApi } from '@/lib/api';
import {
  createAcquisitionsApi,
  type AcquisitionDraftInput,
  type AcquisitionFundingSource,
  type AcquisitionLineInput,
  type AcquisitionSummary,
  type ImportPreview,
} from '@/lib/api/api.acquisitions';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { AcquisitionStatus } from './AcquisitionStatus';

const blankLine = (): AcquisitionLineInput => ({
  acquisition_layout: 'GENERAL',
  product_name: '',
  category: '',
  quantity: 1,
  unit: 'unit',
  technical_specifications: '',
  intended_use: '',
  estimated_unit_price: 0,
  item_classification: 'ASSET',
});

const blankDraft = (): AcquisitionDraftInput => ({
  intended_use_case: '',
  required_by_date: '',
  priority: 'NORMAL',
  funding_source_type: 'DEPARTMENT',
  funding_source_id: '',
  currency: 'INR',
  lines: [blankLine()],
});

const money = (value: unknown, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(
    Number(value ?? 0),
  );

export function AcquisitionWorkspace() {
  const authed = useAuthedApi();
  const api = useMemo(() => createAcquisitionsApi(authed), [authed]);
  const [rows, setRows] = useState<AcquisitionSummary[]>([]);
  const [draft, setDraft] = useState(blankDraft);
  const [showWizard, setShowWizard] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(
    null,
  );
  const [fundingSources, setFundingSources] = useState<
    AcquisitionFundingSource[]
  >([]);

  const reload = useCallback(
    () =>
      api
        .list()
        .then(setRows)
        .catch((error) => toast.error(error.message)),
    [api],
  );
  useEffect(() => {
    void reload();
  }, [reload]);
  useEffect(() => {
    if (!showWizard) return;
    void api
      .fundingSources()
      .then(setFundingSources)
      .catch((error) => toast.error(error.message));
  }, [api, showWizard]);

  const setLine = (index: number, patch: Partial<AcquisitionLineInput>) =>
    setDraft((value) => ({
      ...value,
      lines: value.lines.map((line, i) =>
        i === index ? { ...line, ...patch } : line,
      ),
    }));
  const total = draft.lines.reduce(
    (sum, line) =>
      sum +
      Number(line.quantity || 0) * Number(line.estimated_unit_price || 0) +
      Number(line.delivery_cost || 0) +
      Number(line.tax_cost || 0) +
      Number(line.installation_cost || 0),
    0,
  );
  const visible = rows.filter(
    (row) => filter === 'ALL' || row.status === filter,
  );

  async function save() {
    setBusy(true);
    try {
      const created = await api.create(draft);
      toast.success(
        `${created.acquisition_number} saved as an immutable-ready draft`,
      );
      setDraft(blankDraft());
      setShowWizard(false);
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function previewWorkbook(file?: File) {
    if (!file) return;
    const form = new FormData();
    form.set('file', file);
    form.set('header', JSON.stringify({ ...draft, lines: undefined }));
    try {
      setImportPreview(await api.previewImport(form));
      toast.success('Workbook validated; review before atomic commit');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }

  async function commitWorkbook() {
    if (!importPreview?.import_preview_id) return;
    try {
      await api.commitImport(importPreview.import_preview_id);
      setImportPreview(null);
      setShowWizard(false);
      await reload();
      toast.success('All workbook rows committed atomically');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }

  async function downloadTemplate() {
    try {
      const blob = await api.template();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'falcon-acquisition-template-v1.xlsx';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">
            Digital Acquisitions
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Structured Requester → Procurement → Budget → DoFA workflow.
            Approved records are immutable and Module 1 never creates a purchase
            order.
          </p>
        </div>
        <Button onClick={() => setShowWizard((value) => !value)}>
          <Plus className="mr-2 h-4 w-4" />
          New acquisition
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {[
          [
            'Open',
            rows.filter(
              (r) => !['APPROVED', 'REJECTED', 'WITHDRAWN'].includes(r.status),
            ).length,
          ],
          [
            'Vendor review',
            rows.filter((r) => r.status === 'VENDOR_REVIEW').length,
          ],
          [
            'DoFA pending',
            rows.filter((r) => r.status === 'PENDING_DOFA').length,
          ],
          ['Approved', rows.filter((r) => r.status === 'APPROVED').length],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                {label}
              </p>
              <p className="mt-1 text-2xl font-black">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {showWizard && (
        <Card className="border-blue-200">
          <CardHeader>
            <div className="flex justify-between">
              <CardTitle>Acquisition wizard</CardTitle>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setShowWizard(false)}
              >
                <X />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              1. Purpose & funding · 2. Product lines · 3. Cost review · 4. Save
              and validate
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3">
              <Input
                placeholder="Intended department, lab or project"
                value={draft.intended_lab_or_project ?? ''}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    intended_lab_or_project: e.target.value,
                  })
                }
              />
              <Input
                type="date"
                value={draft.required_by_date}
                onChange={(e) =>
                  setDraft({ ...draft, required_by_date: e.target.value })
                }
              />
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={draft.priority}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    priority: e.target
                      .value as AcquisitionDraftInput['priority'],
                  })
                }
              >
                <option>NORMAL</option>
                <option>HIGH</option>
                <option>URGENT</option>
                <option>LOW</option>
              </select>
              <Input
                className="md:col-span-2"
                placeholder="Intended use case"
                value={draft.intended_use_case}
                onChange={(e) =>
                  setDraft({ ...draft, intended_use_case: e.target.value })
                }
              />
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={draft.funding_source_type}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    funding_source_type: e.target
                      .value as AcquisitionDraftInput['funding_source_type'],
                    funding_source_id: '',
                  })
                }
              >
                <option>DEPARTMENT</option>
                <option>PROGRAM</option>
                <option>PROJECT</option>
                <option>RESEARCH_GRANT</option>
                <option>INSTITUTIONAL</option>
                <option>OTHER</option>
              </select>
              <div className="space-y-1">
                <select
                  aria-label="Funding source"
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={draft.funding_source_id}
                  onChange={(e) =>
                    setDraft({ ...draft, funding_source_id: e.target.value })
                  }
                >
                  <option value="">Select funding source</option>
                  {fundingSources
                    .filter(
                      (source) =>
                        source.funding_source_type ===
                        draft.funding_source_type,
                    )
                    .map((source) => (
                      <option
                        key={source.funding_source_id}
                        value={source.funding_source_id}
                      >
                        {source.label} · {money(source.available_amount)}
                      </option>
                    ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  This is the approved budget, program or grant that will fund
                  the request. You do not need to enter an ID.
                </p>
              </div>
              <Textarea
                className="md:col-span-2"
                placeholder="Special procurement requirements"
                value={draft.special_procurement_requirements ?? ''}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    special_procurement_requirements: e.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-3">
              {draft.lines.map((line, index) => (
                <div key={index} className="rounded-lg border p-4">
                  <div className="mb-3 flex justify-between">
                    <strong>Product line {index + 1}</strong>
                    {draft.lines.length > 1 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            lines: draft.lines.filter((_, i) => i !== index),
                          })
                        }
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-3 md:grid-cols-4">
                    <select
                      className="h-10 rounded-md border bg-background px-3 text-sm"
                      value={line.acquisition_layout}
                      onChange={(e) =>
                        setLine(index, {
                          acquisition_layout: e.target
                            .value as AcquisitionLineInput['acquisition_layout'],
                        })
                      }
                    >
                      <option>GENERAL</option>
                      <option>ONLINE</option>
                      <option>OFFLINE</option>
                    </select>
                    <Input
                      placeholder="Product"
                      value={line.product_name}
                      onChange={(e) =>
                        setLine(index, { product_name: e.target.value })
                      }
                    />
                    <Input
                      placeholder="Category"
                      value={line.category}
                      onChange={(e) =>
                        setLine(index, { category: e.target.value })
                      }
                    />
                    <select
                      className="h-10 rounded-md border bg-background px-3 text-sm"
                      value={line.item_classification}
                      onChange={(e) =>
                        setLine(index, {
                          item_classification: e.target
                            .value as AcquisitionLineInput['item_classification'],
                        })
                      }
                    >
                      <option>ASSET</option>
                      <option>CONSUMABLE</option>
                      <option>SERVICE</option>
                    </select>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      inputMode="numeric"
                      placeholder="Quantity (whole number)"
                      value={line.quantity}
                      onKeyDown={(e) => {
                        if (['.', 'e', 'E', '+', '-'].includes(e.key))
                          e.preventDefault();
                      }}
                      onChange={(e) => {
                        const quantity = Number(e.target.value);
                        if (Number.isInteger(quantity) && quantity >= 0)
                          setLine(index, { quantity });
                      }}
                    />
                    <Input
                      placeholder="Unit"
                      value={line.unit}
                      onChange={(e) => setLine(index, { unit: e.target.value })}
                    />
                    <Input
                      type="number"
                      min="0"
                      placeholder="Unit price"
                      value={line.estimated_unit_price}
                      onChange={(e) =>
                        setLine(index, {
                          estimated_unit_price: Number(e.target.value),
                        })
                      }
                    />
                    <Input
                      type="number"
                      min="0"
                      placeholder="Tax"
                      value={line.tax_cost ?? ''}
                      onChange={(e) =>
                        setLine(index, { tax_cost: Number(e.target.value) })
                      }
                    />
                    <Textarea
                      className="md:col-span-2"
                      placeholder="Technical specifications"
                      value={line.technical_specifications}
                      onChange={(e) =>
                        setLine(index, {
                          technical_specifications: e.target.value,
                        })
                      }
                    />
                    <Textarea
                      className="md:col-span-2"
                      placeholder="Line intended use"
                      value={line.intended_use}
                      onChange={(e) =>
                        setLine(index, { intended_use: e.target.value })
                      }
                    />
                    {line.acquisition_layout === 'ONLINE' && (
                      <Input
                        className="md:col-span-2"
                        type="url"
                        placeholder="HTTPS product URL"
                        value={line.product_url ?? ''}
                        onChange={(e) =>
                          setLine(index, { product_url: e.target.value })
                        }
                      />
                    )}
                    {line.acquisition_layout === 'OFFLINE' && (
                      <Input
                        className="md:col-span-2"
                        placeholder="Preferred vendor name"
                        value={line.preferred_vendor_name ?? ''}
                        onChange={(e) =>
                          setLine(index, {
                            preferred_vendor_name: e.target.value,
                          })
                        }
                      />
                    )}
                  </div>
                </div>
              ))}
              <Button
                variant="outline"
                onClick={() =>
                  setDraft({ ...draft, lines: [...draft.lines, blankLine()] })
                }
              >
                Add product line
              </Button>
            </div>
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-950">
              <p className="font-semibold">Using Excel?</p>
              <p className="mt-1 text-xs">
                Download the Falcon template first. Its sample row, field
                definitions and dropdown rules show the only accepted format.
                Complete purpose, date and funding above before upload.
              </p>
              <Button
                className="mt-3"
                size="sm"
                variant="outline"
                onClick={() => void downloadTemplate()}
              >
                <Download className="mr-2 h-4 w-4" />
                Download Excel template
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-4">
              <div>
                <p className="text-xs uppercase text-muted-foreground">
                  Server will recalculate
                </p>
                <p className="text-xl font-black">{money(total)}</p>
              </div>
              <div className="flex gap-2">
                <label className="inline-flex cursor-pointer items-center rounded-md border px-4 py-2 text-sm font-medium">
                  <Upload className="mr-2 h-4 w-4" />
                  Upload completed template
                  <input
                    className="hidden"
                    type="file"
                    accept=".xlsx"
                    onChange={(e) => void previewWorkbook(e.target.files?.[0])}
                  />
                </label>
                <Button disabled={busy} onClick={() => void save()}>
                  {busy ? 'Saving…' : 'Save draft'}
                </Button>
              </div>
            </div>
            {importPreview && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm">
                <p className="font-semibold">
                  {importPreview.row_count} rows ready · scan{' '}
                  {importPreview.malware_scan_status}
                </p>
                <p>
                  {importPreview.validation?.errors?.length ?? 0} errors,{' '}
                  {importPreview.validation?.warnings?.length ?? 0} warnings
                </p>
                <Button
                  className="mt-3"
                  disabled={!importPreview.validation?.valid}
                  onClick={() => void commitWorkbook()}
                >
                  Confirm atomic import
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Scoped acquisition queue</CardTitle>
            <div className="flex flex-wrap gap-2">
              {[
                'ALL',
                'DRAFT',
                'VENDOR_REVIEW',
                'BUDGET_BLOCKED',
                'PENDING_DOFA',
                'APPROVED',
              ].map((state) => (
                <Button
                  key={state}
                  size="sm"
                  variant={filter === state ? 'default' : 'outline'}
                  onClick={() => setFilter(state)}
                >
                  {state.replaceAll('_', ' ')}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {visible.map((row) => (
            <Link
              key={row.acquisition_id}
              href={
                row.acquisition_version_id
                  ? `/finance/acquisitions/${row.acquisition_version_id}`
                  : '/finance/requisitions'
              }
              className="grid gap-2 rounded-lg border p-4 transition hover:border-blue-300 md:grid-cols-[1fr_auto_auto] md:items-center"
            >
              <div>
                <div className="font-semibold">
                  {row.acquisition_number}{' '}
                  <span className="text-xs text-muted-foreground">
                    v{row.version_number}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground">
                  Required{' '}
                  {row.required_by_date
                    ? new Date(row.required_by_date).toLocaleDateString('en-IN')
                    : 'not recorded'}{' '}
                  · {row.source}
                </div>
              </div>
              <AcquisitionStatus status={row.status} />
              <strong>{money(row.estimated_total, row.currency)}</strong>
            </Link>
          ))}
          {!visible.length && (
            <div className="py-12 text-center text-muted-foreground">
              <ShieldCheck className="mx-auto mb-3 h-8 w-8" />
              No acquisitions in this queue.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
