"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  PackageCheck,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { useAuthedApi } from "@/lib/api";
import {
  createInventoryApi,
  type InventorySummary,
} from "@/lib/api/api.inventory";
import {
  createReturnsApi,
  type ReturnCase,
  type ReturnDashboard,
} from "@/lib/api/api.returns";
import { toast } from "@/lib/notifications/falcon-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const label = (value: string) => value.replaceAll("_", " ");
export function ReturnsWorkspace() {
  const authed = useAuthedApi(),
    api = useMemo(() => createReturnsApi(authed), [authed]),
    inventoryApi = useMemo(() => createInventoryApi(authed), [authed]);
  const [dashboard, setDashboard] = useState<ReturnDashboard | null>(null),
    [cases, setCases] = useState<ReturnCase[]>([]),
    [inventory, setInventory] = useState<InventorySummary[]>([]),
    [selected, setSelected] = useState<ReturnCase | null>(null),
    [tab, setTab] = useState<"cases" | "rma" | "finance">("cases"),
    [creating, setCreating] = useState(false),
    [subjectId, setSubjectId] = useState(""),
    [quantity, setQuantity] = useState("1"),
    [caseType, setCaseType] = useState<"DOA" | "STANDARD_RETURN">("DOA"),
    [reason, setReason] = useState("");
  const reload = useCallback(
    () =>
      Promise.all([
        api.dashboard(),
        api.cases(),
        inventoryApi.list(undefined, "ACTIVE"),
      ])
        .then(([d, c, i]) => {
          setDashboard(d);
          setCases(c);
          setInventory(
            i.filter(
              (x) =>
                ![
                  "RETURN_PENDING",
                  "RETURNED",
                  "RETIRED",
                  "WRITTEN_OFF",
                  "DISPOSED",
                ].includes(x.lifecycle_status),
            ),
          );
        })
        .catch((e: Error) => toast.error(e.message)),
    [api, inventoryApi],
  );
  useEffect(() => void reload(), [reload]);
  const open = async (id: string) => {
    try {
      setSelected(await api.detail(id));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const mutate = async (work: () => Promise<unknown>) => {
    try {
      await work();
      toast.success("Return workflow updated");
      setSelected(null);
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const create = () =>
    mutate(async () => {
      if (!subjectId || !reason.trim())
        throw new Error("Select an exact ITEM/LOT and enter a reason");
      const draft = await api.create({
        case_type: caseType,
        reason,
        allocations: [
          { inventory_record_id: subjectId, quantity: Number(quantity) },
        ],
      });
      await api.submit(draft.return_case_id, draft.aggregate_revision);
      setCreating(false);
      setSubjectId("");
      setReason("");
      setQuantity("1");
    });
  const cards = [
    ["All cases", dashboard?.total ?? 0, RotateCcw],
    ["Awaiting decision", dashboard?.awaiting_decision ?? 0, ShieldCheck],
    ["In execution", dashboard?.in_execution ?? 0, Truck],
    ["DOA reports", dashboard?.doa ?? 0, AlertTriangle],
  ] as const;
  const shown = cases.filter(
    (c) =>
      tab === "cases" ||
      (tab === "rma" && c.rma_status !== "NOT_REQUIRED") ||
      (tab === "finance" &&
        ["REFUND", "CREDIT_NOTE"].includes(c.disposition ?? "")),
  );
  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">
            Return &amp; DOA Control
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Exact ITEM/LOT holds, historical-policy eligibility, independent
            decisions, vendor resolution, and read-only financial recovery.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void reload()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button onClick={() => setCreating((v) => !v)}>
            New Return / DOA
          </Button>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        {cards.map(([name, value, Icon]) => (
          <Card key={name}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-muted-foreground">
                  {name}
                </span>
                <Icon className="h-4 w-4 text-amber-600" />
              </div>
              <p className="mt-2 text-2xl font-black">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      {creating && (
        <Card>
          <CardHeader>
            <CardTitle>Bind the exact physical subject</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-4">
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={caseType}
              onChange={(e) => setCaseType(e.target.value as typeof caseType)}
            >
              <option value="DOA">DOA</option>
              <option value="STANDARD_RETURN">Standard return</option>
            </select>
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={subjectId}
              onChange={(e) => {
                setSubjectId(e.target.value);
                const item = inventory.find(
                  (i) => i.inventory_record_id === e.target.value,
                );
                if (item?.record_type === "ITEM") setQuantity("1");
              }}
            >
              <option value="">Select exact ITEM / LOT</option>
              {inventory.map((i) => (
                <option
                  key={i.inventory_record_id}
                  value={i.inventory_record_id}
                >
                  {i.university_asset_id ?? i.lot_id} · {i.product_name} ·{" "}
                  {i.record_type}
                </option>
              ))}
            </select>
            <Input
              type="number"
              min="0.001"
              step="0.001"
              value={quantity}
              disabled={
                inventory.find((i) => i.inventory_record_id === subjectId)
                  ?.record_type === "ITEM"
              }
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Quantity"
            />
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                caseType === "DOA"
                  ? "Immediate failure description"
                  : "Return reason"
              }
            />
            <div className="md:col-span-4 flex justify-end">
              <Button onClick={() => void create()}>
                Create and submit hold
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      <div className="flex gap-2">
        {(["cases", "rma", "finance"] as const).map((v) => (
          <Button
            key={v}
            variant={tab === v ? "default" : "outline"}
            onClick={() => setTab(v)}
          >
            {v === "cases"
              ? "Case queue"
              : v === "rma"
                ? "RMA & shipment"
                : "Recovery projection"}
          </Button>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>
            {tab === "cases"
              ? "Scoped Return / DOA cases"
              : tab === "rma"
                ? "Vendor and shipment queue"
                : "Finance-posted recovery only"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {shown.map((c) => (
            <button
              key={c.return_case_id}
              onClick={() => void open(c.return_case_id)}
              className="grid w-full gap-2 rounded-lg border p-4 text-left transition hover:border-amber-300 md:grid-cols-[1fr_auto_auto]"
            >
              <div>
                <strong>
                  {c.case_number} · {c.product_name}
                </strong>
                <p className="text-sm text-muted-foreground">
                  {label(c.case_type)} · {c.reason}
                </p>
              </div>
              <div className="text-sm">
                <p>{label(c.eligibility_status)}</p>
                <p className="text-muted-foreground">
                  {label(c.shipment_status)}
                </p>
              </div>
              <Badge
                variant={
                  c.workflow_status === "CLOSED"
                    ? "success"
                    : c.workflow_status === "REJECTED"
                      ? "destructive"
                      : "outline"
                }
              >
                {label(c.workflow_status)}
              </Badge>
            </button>
          ))}
          {!shown.length && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No return cases in this queue.
            </p>
          )}
        </CardContent>
      </Card>
      {selected && (
        <Card className="border-amber-200">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle>{selected.case_number}</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {label(selected.workflow_status)} · revision{" "}
                  {selected.aggregate_revision}
                </p>
              </div>
              <Button variant="ghost" onClick={() => setSelected(null)}>
                Close
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs uppercase text-muted-foreground">
                  Eligibility
                </p>
                <strong>{label(selected.eligibility_status)}</strong>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs uppercase text-muted-foreground">
                  Disposition
                </p>
                <strong>{label(selected.disposition ?? "PENDING")}</strong>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs uppercase text-muted-foreground">
                  Shipment / RMA
                </p>
                <strong>
                  {label(selected.shipment_status)} /{" "}
                  {label(selected.rma_status)}
                </strong>
              </div>
            </div>
            <div>
              <h3 className="font-semibold">Exact held subjects</h3>
              {selected.allocations?.map((a) => (
                <p
                  key={String(a.return_allocation_id)}
                  className="mt-1 rounded border p-2 text-sm"
                >
                  {String(a.university_asset_id ?? a.lot_id)} ·{" "}
                  {String(a.subject_type)} · quantity {String(a.quantity)} ·{" "}
                  {label(String(a.status))}
                </p>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {["TRIAGE", "AWAITING_EVIDENCE"].includes(
                selected.workflow_status,
              ) && (
                <Button
                  onClick={() =>
                    void mutate(() =>
                      api.evaluate(
                        selected.return_case_id,
                        selected.aggregate_revision,
                        {
                          reason:
                            "Evidence and pinned historical policy reviewed",
                        },
                      ),
                    )
                  }
                >
                  Evaluate eligibility <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              )}
              {selected.workflow_status === "DECISION_PENDING" && (
                <Button
                  onClick={() =>
                    void mutate(() =>
                      api.approve(
                        selected.return_case_id,
                        selected.aggregate_revision,
                        {
                          disposition: "RETURN_ONLY",
                          reason: "Eligible exact-subject return approved",
                          attributable_value: 0,
                          exception_approved:
                            selected.eligibility_status ===
                            "EXCEPTION_REQUIRED",
                        },
                      ),
                    )
                  }
                >
                  Approve return
                </Button>
              )}
              {selected.workflow_status === "APPROVED" && (
                <Button
                  onClick={() =>
                    void mutate(() =>
                      api.shipment(
                        selected.return_case_id,
                        selected.aggregate_revision,
                        { status: "READY" },
                      ),
                    )
                  }
                >
                  Mark ready
                </Button>
              )}
              {selected.shipment_status === "READY" && (
                <Button
                  onClick={() =>
                    void mutate(() =>
                      api.shipment(
                        selected.return_case_id,
                        selected.aggregate_revision,
                        { status: "SHIPPED" },
                      ),
                    )
                  }
                >
                  <Truck className="mr-2 h-4 w-4" />
                  Record shipment
                </Button>
              )}
              {["APPROVED", "IN_EXECUTION", "RESOLUTION_PENDING"].includes(
                selected.workflow_status,
              ) && (
                <Button
                  variant="outline"
                  onClick={() =>
                    void mutate(() =>
                      api.reconsider(
                        selected.return_case_id,
                        selected.aggregate_revision,
                        "Independent reconsideration opened",
                      ),
                    )
                  }
                >
                  Reconsider
                </Button>
              )}
            </div>
            {selected.financial_projections?.length ? (
              <div>
                <h3 className="font-semibold">Module 2 posted recovery</h3>
                {selected.financial_projections.map((p) => (
                  <p key={String(p.projection_id)} className="mt-1 text-sm">
                    {String(p.recovery_type)} · {String(p.currency)}{" "}
                    {String(p.posted_amount)} → {String(p.destination_bucket)}
                  </p>
                ))}
              </div>
            ) : null}
            <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
              <PackageCheck className="h-4 w-4" />
              Inventory and finance remain authoritative in Modules 5 and 2;
              this view is orchestration and projection only.
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
