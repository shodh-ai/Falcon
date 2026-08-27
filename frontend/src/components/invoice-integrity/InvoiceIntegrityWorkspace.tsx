"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  FileCheck2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useAuthedApi } from "@/lib/api";
import {
  createInvoiceIntegrityApi,
  type IntegrityCaseSummary,
  type IntegrityDashboard,
} from "@/lib/api/api.invoice-integrity";
import { toast } from "@/lib/notifications/falcon-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const money = (value: unknown, currency = "INR") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(
    Number(value ?? 0),
  );

export function InvoiceIntegrityWorkspace() {
  const authed = useAuthedApi();
  const api = useMemo(() => createInvoiceIntegrityApi(authed), [authed]);
  const [rows, setRows] = useState<IntegrityCaseSummary[]>([]);
  const [dashboard, setDashboard] = useState<IntegrityDashboard | null>(null);
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
  useEffect(() => void reload(), [reload]);
  const visible = rows.filter(
    (row) => filter === "ALL" || row.workflow_state === filter,
  );
  const cards = [
    ["All cases", dashboard?.total_cases ?? 0, FileCheck2],
    ["Source unavailable", dashboard?.source_unavailable ?? 0, AlertTriangle],
    ["High risk", dashboard?.high_risk ?? 0, AlertTriangle],
    [
      "Pending certification",
      dashboard?.pending_certification ?? 0,
      ShieldCheck,
    ],
  ] as const;
  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">
            Invoice Integrity
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Source evidence, deterministic document checks, independent risk
            assessment, investigation, and Finance certification. Payment
            remains controlled by Progressive Procurement.
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
              <p className="mt-2 text-2xl font-black">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Scoped integrity queue</CardTitle>
            <div className="flex flex-wrap gap-2">
              {[
                "ALL",
                "QUEUED",
                "ANALYZING",
                "AWAITING_EVIDENCE",
                "MANUAL_REVIEW",
                "DECISION_PENDING",
                "CLOSED",
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
              key={row.integrity_case_id}
              href={`/finance/invoice-integrity/${row.integrity_case_id}`}
              className="grid gap-3 rounded-lg border p-4 transition hover:border-blue-300 md:grid-cols-[1fr_auto_auto] md:items-center"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{row.invoice_number}</strong>
                  <Badge
                    variant={
                      row.workflow_state === "CLOSED"
                        ? "success"
                        : row.workflow_state === "MANUAL_REVIEW"
                          ? "warning"
                          : "outline"
                    }
                  >
                    {row.workflow_state.replaceAll("_", " ")}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {row.vendor_name} · {row.order_number} · revision{" "}
                  {row.invoice_revision}
                </p>
              </div>
              <div className="text-sm">
                <p className="font-semibold">
                  {money(row.total_amount, row.currency)}
                </p>
                <p className="text-muted-foreground">
                  {row.invoice_type.replaceAll("_", " ")}
                </p>
              </div>
              <div className="text-right text-sm">
                <p>
                  {row.analysis_result?.replaceAll("_", " ") ??
                    "Analysis pending"}
                </p>
                <p className="text-muted-foreground">
                  {row.final_decision?.replaceAll("_", " ") ??
                    row.trust_level.replaceAll("_", " ")}
                </p>
              </div>
            </Link>
          ))}
          {!visible.length && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No invoice-integrity cases in this queue.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
