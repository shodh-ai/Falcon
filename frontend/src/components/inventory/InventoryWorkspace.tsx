"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  Box,
  PackageOpen,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { useAuthedApi } from "@/lib/api";
import {
  createInventoryApi,
  type InventoryDashboard,
  type InventorySummary,
} from "@/lib/api/api.inventory";
import { toast } from "@/lib/notifications/falcon-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function InventoryWorkspace() {
  const authed = useAuthedApi();
  const api = useMemo(() => createInventoryApi(authed), [authed]);
  const [rows, setRows] = useState<InventorySummary[]>([]);
  const [dashboard, setDashboard] = useState<InventoryDashboard | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const reload = useCallback(
    () =>
      Promise.all([api.list(search, status), api.dashboard()])
        .then(([list, summary]) => {
          setRows(list);
          setDashboard(summary);
        })
        .catch((error) => toast.error(error.message)),
    [api, search, status],
  );
  useEffect(() => void reload(), [reload]);
  const cards = [
    ["Universal records", dashboard?.total ?? 0, Archive],
    ["Active", dashboard?.active ?? 0, Box],
    ["Identity pending", dashboard?.identity_pending ?? 0, PackageOpen],
    ["Quarantined", dashboard?.quarantined ?? 0, ShieldAlert],
  ] as const;
  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">
            Universal Inventory & Identity
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Authoritative ITEM and LOT identities, RFID bindings, receipt
            cohorts, custody, location and immutable provenance.
          </p>
        </div>
        <Button variant="outline" onClick={() => void reload()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
        <Button variant="outline" asChild>
          <Link href="/finance/inventory/administration">
            Policies & legacy reconciliation
          </Link>
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
          <CardTitle>Scoped university inventory</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              aria-label="Search inventory"
              placeholder="Asset, RFID, lot, product or model"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              aria-label="Record status"
              className="rounded-md border px-3 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">All statuses</option>
              {[
                "IDENTITY_PENDING",
                "ACTIVATION_PENDING",
                "ACTIVE",
                "QUARANTINED",
                "ON_HOLD",
              ].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </div>
          {rows.map((row) => (
            <Link
              key={row.inventory_record_id}
              href={`/finance/inventory/${row.inventory_record_id}`}
              className="grid gap-3 rounded-lg border p-4 transition hover:border-blue-300 md:grid-cols-[1fr_auto_auto] md:items-center"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{row.product_name}</strong>
                  <Badge
                    variant={
                      row.record_status === "ACTIVE"
                        ? "success"
                        : row.record_status === "QUARANTINED"
                          ? "destructive"
                          : "outline"
                    }
                  >
                    {row.record_status.replaceAll("_", " ")}
                  </Badge>
                  <Badge variant="outline">{row.record_type}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {row.product_model_code} · {row.batch_code} · {row.category}
                </p>
              </div>
              <div className="text-sm">
                <p className="font-semibold">
                  {row.university_asset_id ?? row.lot_id}
                </p>
                <p className="text-muted-foreground">University identity</p>
              </div>
              <div className="text-right text-sm">
                <p>{row.logical_rfid_code ?? "RFID not required/pending"}</p>
                <p className="text-muted-foreground">{row.lifecycle_status}</p>
              </div>
            </Link>
          ))}
          {!rows.length && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No inventory records in this scope.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
