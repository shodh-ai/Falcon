"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthedApi } from "@/lib/api";
import {
  createProcurementsApi,
  type ProcurementCaseDetail,
} from "@/lib/api/api.procurements";
import { toast } from "@/lib/notifications/falcon-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const money = (value: unknown, currency = "INR") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(
    Number(value ?? 0),
  );
const value = (row: Record<string, unknown>, key: string) =>
  String(row[key] ?? "");

export function ProcurementCaseWorkspace({ caseId }: { caseId: string }) {
  const authed = useAuthedApi();
  const api = useMemo(() => createProcurementsApi(authed), [authed]);
  const [detail, setDetail] = useState<ProcurementCaseDetail | null>(null);
  const [tab, setTab] = useState("orders");
  const [busy, setBusy] = useState(false);
  const [importPreview, setImportPreview] = useState<Record<string, unknown> | null>(null);
  const [order, setOrder] = useState({
    proc_case_line_id: "",
    vendor_id: "",
    quantity: 1,
    unit_price: 0,
    expected_delivery_date: "",
  });
  const reload = useCallback(
    () =>
      api
        .get(caseId)
        .then((data) => {
          setDetail(data);
          const first = data.lines[0] as Record<string, unknown> | undefined;
          if (first)
            setOrder((current) => ({
              ...current,
              proc_case_line_id:
                current.proc_case_line_id || value(first, "proc_case_line_id"),
              vendor_id:
                current.vendor_id || value(first, "approved_vendor_id"),
              unit_price:
                current.unit_price || Number(first.approved_unit_price ?? 0),
            }));
        })
        .catch((error) => toast.error(error.message)),
    [api, caseId],
  );
  useEffect(() => {
    void reload();
  }, [reload]);
  async function action(operation: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await operation();
      toast.success(message);
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
    form.set("file", file);
    await action(async () => {
      const preview = await api.previewWorkbook(caseId, form);
      setImportPreview(preview);
      return preview;
    }, "Workbook changes validated");
  }
  if (!detail)
    return (
      <div className="p-8 text-sm text-muted-foreground">
        Loading progressive procurement case…
      </div>
    );
  const revision = Number(detail.aggregate_revision);
  const key = (prefix: string) => `${prefix}:${caseId}:${revision}`;
  const tabs = [
    "orders",
    "receipts",
    "invoices",
    "funds",
    "returns",
    "inventory",
    "audit",
  ];
  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">{detail.acquisition_number}</h1>
          <p className="text-sm text-muted-foreground">
            Procurement case {caseId} · revision {revision} · {detail.status}
          </p>
        </div>
        <div className="flex gap-2">
          <a className="inline-flex h-10 items-center rounded-md border px-4 text-sm font-medium" href={`/api/procurements/v1/cases/${caseId}/workbook`}>Export Excel</a>
          <label className="inline-flex h-10 cursor-pointer items-center rounded-md border px-4 text-sm font-medium">Preview Excel<input className="hidden" type="file" accept=".xlsx" onChange={(event) => void previewWorkbook(event.target.files?.[0])}/></label>
        </div>
      </div>
      {importPreview && <Card className="border-emerald-200 bg-emerald-50"><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm"><div><strong>{String(importPreview.changed_rows ?? 0)} workbook rows validated</strong><p className="text-muted-foreground">Revision {String(importPreview.base_revision ?? revision)} · explicit atomic commit required</p></div><Button disabled={busy} onClick={() => void action(() => api.commitWorkbook(caseId, String(importPreview.import_preview_id)), "Workbook changes committed atomically").then(() => setImportPreview(null))}>Commit workbook</Button></CardContent></Card>}
      <div className="grid gap-3 md:grid-cols-5">
        {[
          ["Allocated", detail.approved_allocation],
          ["Available", detail.available_amount],
          ["Committed", detail.committed_amount],
          ["Expended", detail.expended_amount],
          ["Released", detail.released_amount],
        ].map(([label, amount]) => (
          <Card key={String(label)}>
            <CardContent className="p-4">
              <p className="text-xs uppercase text-muted-foreground">{label}</p>
              <strong>{money(amount, detail.currency)}</strong>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {tabs.map((name) => (
          <Button
            key={name}
            size="sm"
            variant={tab === name ? "default" : "outline"}
            onClick={() => setTab(name)}
          >
            {name.toUpperCase()}
          </Button>
        ))}
      </div>

      {tab === "orders" && (
        <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Create conforming order
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <select
                className="h-10 w-full rounded-md border px-3 text-sm"
                value={order.proc_case_line_id}
                onChange={(e) => {
                  const line = detail.lines.find(
                    (item) =>
                      value(item, "proc_case_line_id") === e.target.value,
                  ) as Record<string, unknown> | undefined;
                  setOrder({
                    ...order,
                    proc_case_line_id: e.target.value,
                    vendor_id: value(line ?? {}, "approved_vendor_id"),
                    unit_price: Number(line?.approved_unit_price ?? 0),
                  });
                }}
              >
                {detail.lines.map((line) => (
                  <option
                    key={value(line, "proc_case_line_id")}
                    value={value(line, "proc_case_line_id")}
                  >
                    {value(line, "product_name")} ·{" "}
                    {value(line, "approved_quantity")} {value(line, "unit")}
                  </option>
                ))}
              </select>
              <Input
                placeholder="Approved vendor ID"
                value={order.vendor_id}
                readOnly
              />
              <Input
                type="number"
                min="0.001"
                step="0.001"
                value={order.quantity}
                onChange={(e) =>
                  setOrder({ ...order, quantity: Number(e.target.value) })
                }
              />
              <Input
                type="number"
                min="0"
                step="0.01"
                value={order.unit_price}
                onChange={(e) =>
                  setOrder({ ...order, unit_price: Number(e.target.value) })
                }
              />
              <Input
                type="date"
                value={order.expected_delivery_date}
                onChange={(e) =>
                  setOrder({ ...order, expected_delivery_date: e.target.value })
                }
              />
              <Button
                disabled={busy}
                onClick={() =>
                  void action(
                    () =>
                      api.createOrder(caseId, revision, {
                        vendor_id: order.vendor_id,
                        expected_delivery_date:
                          order.expected_delivery_date || undefined,
                        lines: [
                          {
                            proc_case_line_id: order.proc_case_line_id,
                            quantity: order.quantity,
                            unit_price: order.unit_price,
                          },
                        ],
                      }),
                    "Order draft created",
                  )
                }
              >
                Save order draft
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Orders and line allocations
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {detail.orders.map((item) => {
                const id = value(item, "order_id");
                return (
                  <div key={id} className="rounded border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <strong>{value(item, "order_number")}</strong>
                        <p className="text-sm text-muted-foreground">
                          {value(item, "status")} ·{" "}
                          {money(item.total_amount, detail.currency)}
                        </p>
                      </div>
                      {value(item, "status") === "DRAFT" && (
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            void action(
                              () =>
                                api.issueOrder(
                                  caseId,
                                  id,
                                  revision,
                                  key(`issue:${id}`),
                                ),
                              "Order issued and funds committed",
                            )
                          }
                        >
                          Issue order
                        </Button>
                      )}
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {detail.order_lines
                        .filter((line) => value(line, "order_id") === id)
                        .map((line) => (
                          <span
                            className="mr-3"
                            key={value(line, "order_line_id")}
                          >
                            {value(line, "quantity")} ×{" "}
                            {money(line.unit_price, detail.currency)}
                          </span>
                        ))}
                    </div>
                  </div>
                );
              })}
              {!detail.orders.length && (
                <p className="py-8 text-center text-muted-foreground">
                  No orders yet.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "receipts" && (
        <Card>
          <CardHeader>
            <CardTitle>Receiving and service acceptance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Stores records accepted/rejected quantities. Service and
              installation lines use independently verified service acceptance.
            </p>
            {detail.receipts.map((item) => (
              <div
                className="rounded border p-3"
                key={value(item, "receipt_id")}
              >
                <strong>{value(item, "receipt_number")}</strong>
                <p className="text-sm text-muted-foreground">
                  Delivered {value(item, "actual_delivery_date")} ·{" "}
                  {value(item, "status")}
                </p>
              </div>
            ))}
            {detail.service_acceptances.map((item) => (
              <div
                className="rounded border p-3"
                key={value(item, "service_acceptance_id")}
              >
                <strong>
                  Service milestone {value(item, "milestone") || "completion"}
                </strong>
                <p className="text-sm text-muted-foreground">
                  {value(item, "accepted_quantity")} accepted ·{" "}
                  {value(item, "status")}
                </p>
              </div>
            ))}
            {!detail.receipts.length && !detail.service_acceptances.length && (
              <p className="py-8 text-center text-muted-foreground">
                No receipt or service-acceptance records.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "invoices" && (
        <Card>
          <CardHeader>
            <CardTitle>Finance invoice and payment queue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {detail.invoices.map((item) => {
              const id = value(item, "invoice_id");
              return (
                <div
                  key={id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded border p-3"
                >
                  <div>
                    <strong>{value(item, "invoice_number")}</strong>
                    <p className="text-sm text-muted-foreground">
                      {value(item, "status")} ·{" "}
                      {money(item.total_amount, detail.currency)}
                    </p>
                  </div>
                  {value(item, "status") === "ENTERED" && (
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void action(
                          () => api.verifyInvoice(caseId, id, revision),
                          "Invoice matched and verified",
                        )
                      }
                    >
                      Run 3-way match & verify
                    </Button>
                  )}
                </div>
              );
            })}
            {!detail.invoices.length && (
              <p className="py-8 text-center text-muted-foreground">
                No invoices entered.
              </p>
            )}
            <div className="rounded bg-slate-50 p-3 text-sm">
              <strong>Verified unpaid liability:</strong>{" "}
              {money(detail.verified_unpaid_liability, detail.currency)}
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "funds" && (
        <Card>
          <CardHeader>
            <CardTitle>Append-only financial ledger</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {detail.ledger.map((entry) => (
              <div
                key={value(entry, "ledger_entry_id")}
                className="grid gap-2 rounded border p-3 text-sm md:grid-cols-[1fr_auto_auto]"
              >
                <div>
                  <strong>
                    {value(entry, "entry_type").replaceAll("_", " ")}
                  </strong>
                  <p className="font-mono text-xs text-muted-foreground">
                    {value(entry, "entry_hash").slice(0, 18)}…
                  </p>
                </div>
                <span>
                  {value(entry, "from_bucket") || "ALLOCATION"} →{" "}
                  {value(entry, "to_bucket")}
                </span>
                <strong>{money(entry.amount, detail.currency)}</strong>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {tab === "returns" && (
        <Card>
          <CardHeader>
            <CardTitle>Returns, repairs, credits and refunds</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {detail.returns.map((item) => (
              <div
                className="rounded border p-3"
                key={value(item, "return_id")}
              >
                <strong>
                  {value(item, "quantity")} units · {value(item, "status")}
                </strong>
                <p className="text-sm text-muted-foreground">
                  Financial settlement: {value(item, "financial_status")} ·{" "}
                  {value(item, "reason")}
                </p>
              </div>
            ))}
            {detail.adjustments.map((item) => (
              <div
                className="rounded border p-3"
                key={value(item, "adjustment_id")}
              >
                <strong>
                  {value(item, "adjustment_type").replaceAll("_", " ")}
                </strong>
                <p className="text-sm text-muted-foreground">
                  {money(item.amount, detail.currency)} ·{" "}
                  {value(item, "status")}
                </p>
              </div>
            ))}
            {!detail.returns.length && !detail.adjustments.length && (
              <p className="py-8 text-center text-muted-foreground">
                No return or financial adjustment records.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "inventory" && (
        <Card>
          <CardHeader>
            <CardTitle>Read-only downstream verification</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Physical verification, RFID, asset identity, consumable ledger,
              and inventory ingestion are owned by later modules.
            </p>
            {detail.downstream_status.map((item) => (
              <div
                className="rounded border p-3"
                key={value(item, "downstream_status_id")}
              >
                <strong>
                  {value(item, "status_type").replaceAll("_", " ")}
                </strong>
                <p className="text-sm text-muted-foreground">
                  {value(item, "status")} · sequence{" "}
                  {value(item, "aggregate_sequence")}
                </p>
              </div>
            ))}
            {!detail.downstream_status.length && (
              <p className="py-8 text-center text-muted-foreground">
                Awaiting downstream status events.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "audit" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Hash-chained change history</CardTitle>
              <Button
                disabled={busy || detail.status === "FINALIZED"}
                onClick={() =>
                  void action(
                    () => api.finalize(caseId, revision, key("finalize")),
                    "Procurement case finalized",
                  )
                }
              >
                Finalize when ready
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {detail.audit_timeline.map((event) => (
              <div
                className="rounded border p-3 text-sm"
                key={value(event, "audit_event_id")}
              >
                <strong>
                  {value(event, "event_type").replaceAll("_", " ")}
                </strong>
                <p className="text-xs text-muted-foreground">
                  {new Date(value(event, "created_at")).toLocaleString("en-IN")}{" "}
                  · {value(event, "event_hash").slice(0, 20)}…
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
