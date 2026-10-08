"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  RefreshCw,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { useAuthedApi } from "@/lib/api";
import {
  createAssetServiceApi,
  type AssetServiceCase,
  type AssetServiceDashboard,
} from "@/lib/api/api.asset-service";
import {
  createInventoryApi,
  type InventorySummary,
} from "@/lib/api/api.inventory";
import { toast } from "@/lib/notifications/falcon-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const label = (value: string) => value.replaceAll("_", " ");
export function AssetServiceWorkspace() {
  const authed = useAuthedApi(),
    api = useMemo(() => createAssetServiceApi(authed), [authed]),
    inventoryApi = useMemo(() => createInventoryApi(authed), [authed]);
  const [dashboard, setDashboard] = useState<AssetServiceDashboard | null>(
      null,
    ),
    [cases, setCases] = useState<AssetServiceCase[]>([]),
    [inventory, setInventory] = useState<InventorySummary[]>([]),
    [selected, setSelected] = useState<AssetServiceCase | null>(null),
    [creating, setCreating] = useState(false),
    [tab, setTab] = useState<"queue" | "preventive" | "warranty" | "analytics">(
      "queue",
    ),
    [assetId, setAssetId] = useState(""),
    [caseType, setCaseType] = useState("CORRECTIVE_REPAIR"),
    [title, setTitle] = useState(""),
    [description, setDescription] = useState("");
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
                x.record_type === "ITEM" &&
                ![
                  "MAINTENANCE",
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
  const mutate = async (
    work: () => Promise<unknown>,
    message = "Service workflow updated",
  ) => {
    try {
      await work();
      toast.success(message);
      setSelected(null);
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const create = () =>
    mutate(async () => {
      if (!assetId || !title.trim() || !description.trim())
        throw new Error("Asset, title and problem description are required");
      const draft = await api.create({
        inventory_record_id: assetId,
        case_type: caseType,
        title,
        problem_description: description,
        severity: caseType === "ACCIDENTAL_DAMAGE" ? "HIGH" : "NORMAL",
      });
      await api.submit(draft.service_case_id, draft.aggregate_revision);
      setCreating(false);
      setAssetId("");
      setTitle("");
      setDescription("");
    }, "Service case submitted");
  const shown = cases.filter(
    (c) =>
      tab === "queue" ||
      (tab === "preventive" &&
        ["PREVENTIVE_MAINTENANCE", "CALIBRATION", "INSPECTION"].includes(
          c.case_type,
        )) ||
      (tab === "warranty" &&
        [
          "WARRANTY_CLAIM",
          "EXTERNAL_SERVICE",
          "MODULE7_REPAIR_REFERRAL",
        ].includes(c.case_type)) ||
      (tab === "analytics" && Boolean(c.final_outcome)),
  );
  const cards = [
    ["All cases", dashboard?.total ?? 0, Wrench],
    ["Awaiting triage", dashboard?.awaiting_triage ?? 0, ShieldCheck],
    ["Active service", dashboard?.active ?? 0, CalendarClock],
    [
      "Retirement referrals",
      dashboard?.retirement_referrals ?? 0,
      AlertTriangle,
    ],
  ] as const;
  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">
            Asset Service &amp; Warranty
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Controlled repairs, preventive maintenance, warranty entitlement,
            service custody, parts lineage, re-verification and independent
            return-to-service.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void reload()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button onClick={() => setCreating((v) => !v)}>
            New service case
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
                <Icon className="h-4 w-4 text-indigo-600" />
              </div>
              <p className="mt-2 text-2xl font-black">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      {creating && (
        <Card>
          <CardHeader>
            <CardTitle>Open an exact-asset service case</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
            >
              <option value="">Select Module 5 ITEM</option>
              {inventory.map((i) => (
                <option
                  key={i.inventory_record_id}
                  value={i.inventory_record_id}
                >
                  {i.university_asset_id} · {i.product_name}
                </option>
              ))}
            </select>
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={caseType}
              onChange={(e) => setCaseType(e.target.value)}
            >
              {[
                "CORRECTIVE_REPAIR",
                "WARRANTY_CLAIM",
                "PREVENTIVE_MAINTENANCE",
                "CALIBRATION",
                "INSPECTION",
                "INTERNAL_MAINTENANCE",
                "EXTERNAL_SERVICE",
                "ACCIDENTAL_DAMAGE",
              ].map((v) => (
                <option key={v} value={v}>
                  {label(v)}
                </option>
              ))}
            </select>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Issue or service title"
            />
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Problem, symptoms or required work"
            />
            <div className="lg:col-span-4 flex justify-end">
              <Button onClick={() => void create()}>
                Create and place service hold
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      <div className="flex flex-wrap gap-2">
        {(["queue", "preventive", "warranty", "analytics"] as const).map(
          (v) => (
            <Button
              key={v}
              variant={tab === v ? "default" : "outline"}
              onClick={() => setTab(v)}
            >
              {v === "queue" ? "Service queue" : label(v)}
            </Button>
          ),
        )}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Scoped asset-service cases</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {shown.map((c) => (
            <button
              key={c.service_case_id}
              onClick={() => void open(c.service_case_id)}
              className="grid w-full gap-2 rounded-lg border p-4 text-left transition hover:border-indigo-300 md:grid-cols-[1fr_auto_auto]"
            >
              <div>
                <strong>
                  {c.case_number} · {c.university_asset_id ?? "Asset"} ·{" "}
                  {c.product_name}
                </strong>
                <p className="text-sm text-muted-foreground">
                  {label(c.case_type)} · {c.title}
                </p>
              </div>
              <div className="text-sm">
                <p>{label(c.coverage_status)}</p>
                <p className="text-muted-foreground">
                  {label(c.asset_availability)}
                </p>
              </div>
              <Badge
                variant={
                  c.workflow_status === "CLOSED"
                    ? "success"
                    : c.workflow_status === "DISPUTED"
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
              No service cases in this queue.
            </p>
          )}
        </CardContent>
      </Card>
      {selected && (
        <Card className="border-indigo-200">
          <CardHeader>
            <div className="flex justify-between">
              <div>
                <CardTitle>
                  {selected.case_number} · {selected.university_asset_id}
                </CardTitle>
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
            <div className="grid gap-3 md:grid-cols-4">
              {[
                ["Coverage", selected.coverage_status],
                ["Availability", selected.asset_availability],
                ["Severity", selected.severity],
                ["Outcome", selected.final_outcome ?? "PENDING"],
              ].map(([name, value]) => (
                <div key={name} className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs uppercase text-muted-foreground">
                    {name}
                  </p>
                  <strong>{label(value)}</strong>
                </div>
              ))}
            </div>
            <p className="rounded border p-3 text-sm">
              {selected.problem_description}
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded border p-3">
                <p className="text-xs uppercase text-muted-foreground">Tasks</p>
                <strong>{selected.tasks?.length ?? 0}</strong>
              </div>
              <div className="rounded border p-3">
                <p className="text-xs uppercase text-muted-foreground">Parts</p>
                <strong>{selected.parts?.length ?? 0}</strong>
              </div>
              <div className="rounded border p-3">
                <p className="text-xs uppercase text-muted-foreground">
                  Re-verification
                </p>
                <strong>
                  {label(
                    String(
                      selected.reverification?.at(-1)?.status ??
                        "NOT REQUESTED",
                    ),
                  )}
                </strong>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {selected.workflow_status === "SUBMITTED" && (
                <Button
                  onClick={() =>
                    void mutate(() =>
                      api.triage(
                        selected.service_case_id,
                        selected.aggregate_revision,
                        { approved: true, reason: "Service request reviewed" },
                      ),
                    )
                  }
                >
                  Approve triage
                </Button>
              )}
              {selected.workflow_status === "APPROVED" &&
                selected.coverage_status === "PENDING" && (
                  <Button
                    onClick={() =>
                      void mutate(() =>
                        api.coverage(
                          selected.service_case_id,
                          selected.aggregate_revision,
                          {
                            coverage_status: "INTERNAL_SERVICE",
                            source_precedence: ["INTERNAL_SERVICE"],
                            coverage_payload: { no_external_commitment: true },
                            policy_version: 1,
                          },
                        ),
                      )
                    }
                  >
                    Mark internal service
                  </Button>
                )}
              {selected.workflow_status === "IN_PROGRESS" && (
                <Button
                  onClick={() =>
                    void mutate(() =>
                      api.diagnose(
                        selected.service_case_id,
                        selected.aggregate_revision,
                        {
                          proposed_work:
                            "Inspection and approved corrective work completed",
                          requires_reverification: false,
                        },
                      ),
                    )
                  }
                >
                  Record diagnosis
                </Button>
              )}
              {selected.workflow_status === "IN_PROGRESS" &&
                Boolean(selected.diagnoses?.length) && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      void mutate(() =>
                        api.completeWork(
                          selected.service_case_id,
                          selected.aggregate_revision,
                          {
                            completion_summary:
                              "Technical work and required tests completed",
                            requires_reverification: false,
                          },
                        ),
                      )
                    }
                  >
                    Complete technical work
                  </Button>
                )}
              {selected.workflow_status === "ACCEPTANCE_PENDING" && (
                <Button
                  onClick={() =>
                    void mutate(() =>
                      api.accept(
                        selected.service_case_id,
                        selected.aggregate_revision,
                        {
                          decision: "ACCEPTED",
                          reason: "Independent acceptance checks passed",
                        },
                      ),
                    )
                  }
                >
                  Accept return to service
                </Button>
              )}
              {selected.workflow_status === "CLOSED" && (
                <Button
                  variant="outline"
                  onClick={() =>
                    void mutate(() =>
                      api.supersede(
                        selected.service_case_id,
                        "Fault recurred after closure",
                      ),
                    )
                  }
                >
                  Open superseding case
                </Button>
              )}
            </div>
            <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-sm text-indigo-950">
              <strong>Authority boundary:</strong> Module 5 controls identity
              and lifecycle; Modules 1–2 authorize paid work; Module 6 controls
              stocked parts; Module 4 clears material repairs; Module 9 owns
              retirement.
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
