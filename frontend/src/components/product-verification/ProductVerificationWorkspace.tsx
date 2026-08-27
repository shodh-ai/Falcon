"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Camera, PackageCheck, RefreshCw, ScanLine, ShieldAlert } from "lucide-react";
import { useAuthedApi } from "@/lib/api";
import {
  createProductVerificationApi,
  type ProductVerificationCaseSummary,
  type ProductVerificationDashboard,
} from "@/lib/api/api.product-verification";
import { toast } from "@/lib/notifications/falcon-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ProductVerificationWorkspace() {
  const authed = useAuthedApi();
  const api = useMemo(() => createProductVerificationApi(authed), [authed]);
  const [rows, setRows] = useState<ProductVerificationCaseSummary[]>([]);
  const [dashboard, setDashboard] = useState<ProductVerificationDashboard | null>(null);
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
  const visible = rows.filter((row) => filter === "ALL" || row.workflow_state === filter);
  const cards = [
    ["Physical cases", dashboard?.total_cases ?? 0, PackageCheck],
    ["Awaiting capture", dashboard?.awaiting_capture ?? 0, Camera],
    ["Manual review", dashboard?.manual_review ?? 0, ShieldAlert],
    ["Verified subjects", dashboard?.verified_subjects ?? 0, ScanLine],
  ] as const;
  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Physical Product Verification</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Trusted receiving capture, per-item and consumable-lot comparison, independent review, and revocable signed identities before inventory allocation.
          </p>
        </div>
        <Button variant="outline" onClick={() => void reload()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        {cards.map(([label, value, Icon]) => (
          <Card key={label}><CardContent className="p-4"><div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p><Icon className="h-4 w-4 text-blue-600" /></div><p className="mt-2 text-2xl font-black">{value}</p></CardContent></Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Scoped receiving and review queue</CardTitle>
            <div className="flex flex-wrap gap-2">
              {["ALL", "QUEUED", "CAPTURING", "ANALYZING", "AWAITING_EVIDENCE", "MANUAL_REVIEW", "DECISION_PENDING", "CLOSED"].map((state) => (
                <Button key={state} size="sm" variant={filter === state ? "default" : "outline"} onClick={() => setFilter(state)}>{state.replaceAll("_", " ")}</Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {visible.map((row) => (
            <Link key={row.verification_case_id} href={`/finance/product-verification/${row.verification_case_id}`} className="grid gap-3 rounded-lg border p-4 transition hover:border-blue-300 md:grid-cols-[1fr_auto_auto] md:items-center">
              <div><div className="flex flex-wrap items-center gap-2"><strong>{row.product_name}</strong><Badge variant={row.workflow_state === "CLOSED" ? "success" : row.workflow_state === "MANUAL_REVIEW" ? "warning" : "outline"}>{row.workflow_state.replaceAll("_", " ")}</Badge><Badge variant="outline">{row.subject_type}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{row.order_number} · {row.receipt_number} · {row.category}</p></div>
              <div className="text-sm"><p className="font-semibold">{Number(row.eligible_quantity)} {row.unit_of_measure}</p><p className="text-muted-foreground">eligible quantity</p></div>
              <div className="text-right text-sm"><p>{row.verified_count}/{row.subject_count} verified</p><p className="text-muted-foreground">subject identities</p></div>
            </Link>
          ))}
          {!visible.length && <p className="py-8 text-center text-sm text-muted-foreground">No physical-verification cases in this queue.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
