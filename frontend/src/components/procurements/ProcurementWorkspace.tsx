"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Clock,
  IndianRupee,
  PackageCheck,
  RefreshCw,
} from "lucide-react";
import { useAuthedApi } from "@/lib/api";
import {
  createProcurementsApi,
  type ProcurementCaseSummary,
  type ProcurementDashboard,
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
  const [dashboard, setDashboard] = useState<ProcurementDashboard | null>(null);
  const [filter, setFilter] = useState("ALL");
  const reload = useCallback(
    () =>
      Promise.all([api.list(), api.dashboard()])
        .then(([cases, summary]) => {
          setRows(cases);
          setDashboard(summary);
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
  const cards = [
    ["Approved", dashboard?.approved_allocation ?? 0, IndianRupee],
    ["Available", dashboard?.available_amount ?? 0, PackageCheck],
    ["Committed", dashboard?.committed_amount ?? 0, Clock],
    ["Expended", dashboard?.expended_amount ?? 0, IndianRupee],
  ] as const;
  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">
            Progressive Procurement
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Canonical allocation → commitment → expenditure ledger with
            independent order, receipt, invoice, return, payment, and inventory
            progress.
          </p>
        </div>
        <Button variant="outline" onClick={() => void reload()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        {cards.map(([label, value, Icon]) => (
          <Card key={label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  {label}
                </p>
                <Icon className="h-4 w-4 text-blue-600" />
              </div>
              <p className="mt-2 text-2xl font-black">{money(value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      {!!dashboard?.alerts.length && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle className="flex items-center text-base">
              <AlertTriangle className="mr-2 h-4 w-4" />
              Financial attention queue
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 md:grid-cols-3">
            {dashboard.alerts.map((alert, index) => (
              <Link
                key={`${alert.proc_case_id}-${alert.type}-${index}`}
                href={`/finance/procurements/${alert.proc_case_id}`}
                className="rounded border border-amber-200 bg-white p-3 text-sm"
              >
                <strong>{alert.type.replaceAll("_", " ")}</strong>
                <p className="text-muted-foreground">{String(alert.value)}</p>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Scoped persona queue</CardTitle>
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
