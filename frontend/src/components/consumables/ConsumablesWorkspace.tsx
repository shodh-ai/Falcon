"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  ClipboardList,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { useAuthedApi } from "@/lib/api";
import {
  createConsumablesApi,
  type ConsumableLot,
  type ConsumablesDashboard,
  type StockRequest,
} from "@/lib/api/api.consumables";
import { toast } from "@/lib/notifications/falcon-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ConsumablesWorkspace() {
  const authed = useAuthedApi(),
    api = useMemo(() => createConsumablesApi(authed), [authed]);
  const [dashboard, setDashboard] = useState<ConsumablesDashboard | null>(null),
    [lots, setLots] = useState<ConsumableLot[]>([]),
    [requests, setRequests] = useState<StockRequest[]>([]),
    [alerts, setAlerts] = useState<Record<string, unknown>[]>([]),
    [tab, setTab] = useState<"stock" | "requests" | "alerts">("stock");
  const reload = useCallback(
    () =>
      Promise.all([
        api.dashboard(),
        api.balances(),
        api.requests(),
        api.alerts(),
      ])
        .then(([d, l, r, a]) => {
          setDashboard(d);
          setLots(l);
          setRequests(r);
          setAlerts(a);
        })
        .catch((e: Error) => toast.error(e.message)),
    [api],
  );
  useEffect(() => void reload(), [reload]);
  const cards = [
    ["Store on hand", dashboard?.store_on_hand ?? 0, Boxes],
    ["Issued custody", dashboard?.issued_custody_outstanding ?? 0, RotateCcw],
    ["Active requests", dashboard?.active ?? 0, ClipboardList],
    ["Open alerts", dashboard?.open_alerts ?? 0, AlertTriangle],
  ] as const;
  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">
            Consumables Operations
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Approval-time FEFO reservations, issue custody, unused returns, LOT
            counts, expiry controls and governed replenishment.
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
                <Icon className="h-4 w-4 text-emerald-600" />
              </div>
              <p className="mt-2 text-2xl font-black">{String(value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="flex gap-2">
        {(["stock", "requests", "alerts"] as const).map((v) => (
          <Button
            key={v}
            variant={tab === v ? "default" : "outline"}
            onClick={() => setTab(v)}
          >
            {v[0].toUpperCase() + v.slice(1)}
          </Button>
        ))}
      </div>
      {tab === "stock" && (
        <Card>
          <CardHeader>
            <CardTitle>Eligible LOT stock</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {lots.map((l) => (
              <div
                key={l.inventory_record_id}
                className="grid gap-2 rounded-lg border p-4 md:grid-cols-[1fr_auto_auto]"
              >
                <div>
                  <strong>{l.product_name}</strong>
                  <p className="text-sm text-muted-foreground">
                    {l.lot_id} · Batch {l.batch_number ?? "—"} · expires{" "}
                    {l.expiry_date ?? "not specified"}
                  </p>
                </div>
                <div>
                  <p className="font-semibold">
                    {Number(l.store_on_hand) - Number(l.reserved)}{" "}
                    {l.unit_of_measure}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    available ({l.reserved} reserved)
                  </p>
                </div>
                <Badge
                  variant={
                    l.eligibility === "AVAILABLE"
                      ? "success"
                      : l.eligibility === "EXPIRING_SOON"
                        ? "outline"
                        : "destructive"
                  }
                >
                  {l.eligibility.replaceAll("_", " ")}
                </Badge>
              </div>
            ))}
            {!lots.length && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No LOT inventory in this scope.
              </p>
            )}
          </CardContent>
        </Card>
      )}
      {tab === "requests" && (
        <Card>
          <CardHeader>
            <CardTitle>Stock request queue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {requests.map((r) => (
              <div
                key={r.stock_request_id}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                <div>
                  <strong>{r.request_number}</strong>
                  <p className="text-sm text-muted-foreground">
                    {r.intended_use} · {r.priority}
                  </p>
                </div>
                <Badge variant={r.status === "ISSUED" ? "success" : "outline"}>
                  {r.status.replaceAll("_", " ")}
                </Badge>
              </div>
            ))}
            {!requests.length && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No requests in this scope.
              </p>
            )}
          </CardContent>
        </Card>
      )}
      {tab === "alerts" && (
        <Card>
          <CardHeader>
            <CardTitle>Stateful stock alerts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {alerts.map((a) => (
              <div
                key={String(a.alert_id)}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                <div>
                  <strong>{String(a.alert_type).replaceAll("_", " ")}</strong>
                  <p className="text-sm text-muted-foreground">
                    Last seen{" "}
                    {new Date(String(a.last_seen_at)).toLocaleString()}
                  </p>
                </div>
                <Badge
                  variant={a.status === "OPEN" ? "destructive" : "outline"}
                >
                  {String(a.status)}
                </Badge>
              </div>
            ))}
            {!alerts.length && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No active consumables alerts.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
