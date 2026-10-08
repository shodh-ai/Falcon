"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  ClipboardList,
  Plus,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useAuthedApi } from "@/lib/api";
import {
  createConsumablesApi,
  type ConsumableLot,
  type ConsumableProduct,
  type ConsumablesDashboard,
  type StockRequest,
} from "@/lib/api/api.consumables";
import { toast } from "@/lib/notifications/falcon-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function ConsumablesWorkspace() {
  const { user } = useAuth();
  const authed = useAuthedApi(),
    api = useMemo(() => createConsumablesApi(authed), [authed]);
  const [dashboard, setDashboard] = useState<ConsumablesDashboard | null>(null),
    [lots, setLots] = useState<ConsumableLot[]>([]),
    [products, setProducts] = useState<ConsumableProduct[]>([]),
    [requests, setRequests] = useState<StockRequest[]>([]),
    [alerts, setAlerts] = useState<Record<string, unknown>[]>([]),
    [tab, setTab] = useState<"stock" | "requests" | "alerts">("stock"),
    [busy, setBusy] = useState(false),
    [request, setRequest] = useState({
      department_id: user?.dept_id ? String(user.dept_id) : "",
      product_model_id: "",
      quantity: 30,
      unit_of_measure: "box",
      intended_use: "",
      required_by_date: "",
      priority: "NORMAL",
      justification: "",
    });
  const reload = useCallback(
    () =>
      Promise.all([
        api.dashboard(),
        api.balances(),
        api.products(),
        api.requests(),
        api.alerts(),
      ])
        .then(([d, l, p, r, a]) => {
          setDashboard(d);
          setLots(l);
          setProducts(p);
          setRequests(r);
          setAlerts(a);
          setRequest((current) => ({
            ...current,
            product_model_id:
              current.product_model_id || p[0]?.product_model_id || "",
          }));
        })
        .catch((e: Error) => toast.error(e.message)),
    [api],
  );
  useEffect(() => void reload(), [reload]);
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
  const requestDepartmentId =
    request.department_id || (user?.dept_id ? String(user.dept_id) : "");
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
        <div className="flex gap-2">
          <Button onClick={() => setTab("requests")}>
            <Plus className="mr-2 h-4 w-4" />
            Create request
          </Button>
          <Button variant="outline" onClick={() => void reload()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
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
        <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Create stock request</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Request an exact quantity from the product catalog. Stock is
                reserved by FEFO only after independent approval.
              </p>
              <label className="block space-y-1 text-sm font-medium">
                <span>Department ID</span>
                <Input
                  type="number"
                  min="1"
                  value={requestDepartmentId}
                  onChange={(event) =>
                    setRequest({
                      ...request,
                      department_id: event.target.value,
                    })
                  }
                />
              </label>
              <label className="block space-y-1 text-sm font-medium">
                <span>Product</span>
                <select
                  className="h-10 w-full rounded-md border px-3 text-sm"
                  value={request.product_model_id}
                  onChange={(event) =>
                    setRequest({
                      ...request,
                      product_model_id: event.target.value,
                    })
                  }
                >
                  <option value="">Select a product</option>
                  {products.map((product) => (
                    <option
                      key={product.product_model_id}
                      value={product.product_model_id}
                    >
                      {product.product_name} · {product.product_model_code}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1 text-sm font-medium">
                  <span>Quantity</span>
                  <Input
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={request.quantity}
                    onChange={(event) =>
                      setRequest({
                        ...request,
                        quantity: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label className="space-y-1 text-sm font-medium">
                  <span>Unit</span>
                  <Input
                    value={request.unit_of_measure}
                    onChange={(event) =>
                      setRequest({
                        ...request,
                        unit_of_measure: event.target.value,
                      })
                    }
                  />
                </label>
              </div>
              <label className="block space-y-1 text-sm font-medium">
                <span>Intended use</span>
                <Input
                  placeholder="Example: Physics laboratory practicals"
                  value={request.intended_use}
                  onChange={(event) =>
                    setRequest({
                      ...request,
                      intended_use: event.target.value,
                    })
                  }
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1 text-sm font-medium">
                  <span>Required by</span>
                  <Input
                    type="date"
                    value={request.required_by_date}
                    onChange={(event) =>
                      setRequest({
                        ...request,
                        required_by_date: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="space-y-1 text-sm font-medium">
                  <span>Priority</span>
                  <select
                    className="h-10 w-full rounded-md border px-3 text-sm"
                    value={request.priority}
                    onChange={(event) =>
                      setRequest({ ...request, priority: event.target.value })
                    }
                  >
                    <option value="NORMAL">Normal</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </label>
              </div>
              <Textarea
                aria-label="Justification"
                placeholder="Justification"
                value={request.justification}
                onChange={(event) =>
                  setRequest({
                    ...request,
                    justification: event.target.value,
                  })
                }
              />
              <Button
                disabled={
                  busy ||
                  !requestDepartmentId ||
                  !request.product_model_id ||
                  !request.intended_use.trim() ||
                  !request.unit_of_measure.trim() ||
                  request.quantity <= 0
                }
                onClick={() =>
                  void action(
                    () =>
                      api.createRequest({
                        department_id: Number(requestDepartmentId),
                        intended_use: request.intended_use.trim(),
                        required_by_date:
                          request.required_by_date || undefined,
                        priority: request.priority,
                        justification:
                          request.justification.trim() || undefined,
                        lines: [
                          {
                            product_model_id: request.product_model_id,
                            quantity: request.quantity,
                            unit_of_measure: request.unit_of_measure.trim(),
                          },
                        ],
                      }),
                    "Stock request draft created",
                  )
                }
              >
                Create request draft
              </Button>
              {!products.length && (
                <p className="rounded bg-amber-50 p-3 text-sm text-amber-900">
                  No requestable products exist yet. Complete product
                  verification and inventory ingestion first.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Stock request queue</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {requests.map((r) => (
                <div
                  key={r.stock_request_id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
                >
                  <div>
                    <strong>{r.request_number}</strong>
                    <p className="text-sm text-muted-foreground">
                      {r.intended_use} · {r.priority}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.lines
                        .map(
                          (line) =>
                            `${String(line.requested_quantity ?? "")} ${String(line.unit_of_measure ?? "")}`,
                        )
                        .join(" · ")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={r.status === "ISSUED" ? "success" : "outline"}
                    >
                      {r.status.replaceAll("_", " ")}
                    </Badge>
                    {r.status === "DRAFT" && (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void action(
                            () =>
                              api.submit(
                                r.stock_request_id,
                                Number(r.aggregate_revision),
                              ),
                            "Stock request submitted for approval",
                          )
                        }
                      >
                        Submit request
                      </Button>
                    )}
                    {r.status === "SUBMITTED" && (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void action(
                            () =>
                              api.approve(
                                r.stock_request_id,
                                Number(r.aggregate_revision),
                                {},
                              ),
                            "Stock reserved using FEFO",
                          )
                        }
                      >
                        Approve &amp; reserve
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {!requests.length && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No requests in this scope.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
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
