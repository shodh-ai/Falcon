"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PackageCheck, RefreshCw } from "lucide-react";
import { useAuthedApi } from "@/lib/api";
import {
  createProcurementsApi,
  type ProcurementCaseSummary,
} from "@/lib/api/api.procurements";
import { toast } from "@/lib/notifications/falcon-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const money = (value: unknown, currency = "INR") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(
    Number(value ?? 0),
  );

export function ProcurementWorkspace() {
  const authed = useAuthedApi();
  const api = useMemo(() => createProcurementsApi(authed), [authed]);
  const [rows, setRows] = useState<ProcurementCaseSummary[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState("");
  const [filter, setFilter] = useState("ALL");
  const reload = useCallback(
    () =>
      api.list()
        .then((cases) => {
          setRows(cases);
          setSelectedCaseId((current) => current || cases[0]?.proc_case_id || "");
        })
        .catch((error) => toast.error(error.message)),
    [api],
  );
  useEffect(() => {
    void reload();
  }, [reload]);
  const visible = rows.filter(
    (row) => filter === "ALL" || row.status === filter,
  );
  const selected = rows.find((row) => row.proc_case_id === selectedCaseId);
  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">
            Progressive Procurement
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Select one approved requirement. Financial and operational figures
            are shown only for that procurement case.
          </p>
        </div>
        <Button variant="outline" onClick={() => void reload()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>
      <Card className="border-blue-200">
        <CardHeader><CardTitle>Select procurement requirement</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <select aria-label="Procurement requirement" className="h-11 w-full rounded-md border bg-background px-3" value={selectedCaseId} onChange={(event) => setSelectedCaseId(event.target.value)}>
            {rows.map((row) => <option key={row.proc_case_id} value={row.proc_case_id}>{row.acquisition_number} · {row.status.replaceAll("_", " ")} · {money(row.approved_allocation,row.currency)}</option>)}
          </select>
          {selected && <div className="grid gap-3 md:grid-cols-4">
            {[["Approved",selected.approved_allocation],["Available",selected.available_amount],["Committed",selected.committed_amount],["Expended",selected.expended_amount]].map(([label,amount]) => <div key={String(label)} className="rounded-md bg-slate-50 p-3"><p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p><strong>{money(amount,selected.currency)}</strong></div>)}
          </div>}
          {selected && <Button asChild><Link href={`/finance/procurements/${selected.proc_case_id}`}>Open this procurement case</Link></Button>}
          {!rows.length && <p className="text-sm text-muted-foreground">No procurement requirements are assigned to your scope.</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Other requirements in your scoped queue</CardTitle>
            <div className="flex gap-2">
              {[
                "ALL",
                "ACTIVE",
                "ON_HOLD",
                "READY_TO_FINALIZE",
                "FINALIZED",
              ].map((state) => (
                <Button
                  key={state}
                  size="sm"
                  variant={filter === state ? "default" : "outline"}
                  onClick={() => setFilter(state)}
                >
                  {state.replaceAll("_", " ")}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {visible.map((row) => (
            <Link
              key={row.proc_case_id}
              href={`/finance/procurements/${row.proc_case_id}`}
              className="grid gap-3 rounded-lg border p-4 transition hover:border-blue-300 md:grid-cols-[1fr_auto_auto] md:items-center"
            >
              <div>
                <strong>{row.acquisition_number}</strong>
                <p className="text-sm text-muted-foreground">
                  Allocated {row.allocation_age_days} days ago · inactive{" "}
                  {row.inactive_days} days
                </p>
              </div>
              <div className="text-sm">
                <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold">
                  {row.status.replaceAll("_", " ")}
                </span>
              </div>
              <div className="text-right">
                <strong>
                  {money(row.available_amount, row.currency)} available
                </strong>
                <p className="text-xs text-muted-foreground">
                  {Number(row.utilization_percent ?? 0).toFixed(1)}% expended
                </p>
              </div>
            </Link>
          ))}
          {!visible.length && (
            <div className="py-12 text-center text-muted-foreground">
              <PackageCheck className="mx-auto mb-3 h-8 w-8" />
              No procurement cases in this queue.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
