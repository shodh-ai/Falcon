"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeIndianRupee,
  DatabaseZap,
  FileCheck2,
  Gavel,
  Recycle,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { useAuthedApi } from "@/lib/api";
import {
  createAssetRetirementApi,
  type RetirementAsset,
  type RetirementCase,
  type RetirementDashboard,
} from "@/lib/api/api.asset-retirement";
import { toast } from "@/lib/notifications/falcon-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const label = (value: string) => value.replaceAll("_", " ");

export function AssetRetirementWorkspace() {
  const authed = useAuthedApi(),
    api = useMemo(() => createAssetRetirementApi(authed), [authed]);
  const [dashboard, setDashboard] = useState<RetirementDashboard | null>(null),
    [cases, setCases] = useState<RetirementCase[]>([]),
    [assets, setAssets] = useState<RetirementAsset[]>([]),
    [selected, setSelected] = useState<RetirementCase | null>(null),
    [showCreate, setShowCreate] = useState(false),
    [assetId, setAssetId] = useState(""),
    [title, setTitle] = useState(""),
    [reason, setReason] = useState(""),
    [tab, setTab] = useState<
      "queue" | "sanitization" | "disposition" | "reconciliation" | "closed"
    >("queue");
  const reload = useCallback(
    () =>
      Promise.all([api.dashboard(), api.cases(), api.eligibleAssets()])
        .then(([summary, queue, inventory]) => {
          setDashboard(summary);
          setCases(queue);
          setAssets(inventory);
        })
        .catch((error: Error) => toast.error(error.message)),
    [api],
  );
  useEffect(() => void reload(), [reload]);
  const open = async (id: string) => {
    try {
      setSelected(await api.detail(id));
    } catch (error) {
      toast.error((error as Error).message);
    }
  };
  const mutate = async (work: () => Promise<unknown>, message: string) => {
    try {
      await work();
      toast.success(message);
      setSelected(null);
      await reload();
    } catch (error) {
      toast.error((error as Error).message);
    }
  };
  const create = () =>
    mutate(async () => {
      if (!assetId || !title.trim() || !reason.trim())
        throw new Error("Asset, title and retirement reason are required");
      const draft = await api.create({
        inventory_record_ids: [assetId],
        title,
        retirement_reason: reason,
      });
      await api.submit(draft.retirement_case_id, draft.aggregate_revision);
      setAssetId("");
      setTitle("");
      setReason("");
      setShowCreate(false);
    }, "Retirement assessment opened and asset hold placed");
  const shown = cases.filter(
    (item) =>
      tab === "queue" ||
      (tab === "sanitization" &&
        [
          "REQUIRED",
          "IN_PROGRESS",
          "FAILED",
          "PHYSICAL_DESTRUCTION_REQUIRED",
        ].includes(item.sanitization_status)) ||
      (tab === "disposition" &&
        ["APPROVED", "PREPARATION", "IN_EXECUTION"].includes(
          item.workflow_status,
        )) ||
      (tab === "reconciliation" &&
        [
          "FINANCE_PENDING",
          "FINANCE_POSTING_FAILED",
          "PROCEEDS_PENDING",
        ].includes(item.finance_status)) ||
      (tab === "closed" && item.workflow_status === "CLOSED"),
  );
  const cards = [
    ["All cases", dashboard?.total ?? 0, Recycle],
    ["Awaiting approval", dashboard?.awaiting_approval ?? 0, Gavel],
    ["Sanitization", dashboard?.sanitization_queue ?? 0, DatabaseZap],
    [
      "Finance mismatch",
      dashboard?.finance_reconciliation ?? 0,
      BadgeIndianRupee,
    ],
  ] as const;
  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">
            Asset Retirement &amp; Disposal
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Controlled retirement holds, DoFA approval, data sanitization,
            physical disposition, Finance reconciliation and immutable lifecycle
            certification.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void reload()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
          <Button onClick={() => setShowCreate((value) => !value)}>
            New retirement case
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
                <Icon className="h-4 w-4 text-emerald-700" />
              </div>
              <p className="mt-2 text-2xl font-black">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      {showCreate && (
        <Card>
          <CardHeader>
            <CardTitle>Place an exact-asset retirement hold</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={assetId}
              onChange={(event) => setAssetId(event.target.value)}
            >
              <option value="">Select Module 5 ITEM</option>
              {assets.map((asset) => (
                <option
                  key={asset.inventory_record_id}
                  value={asset.inventory_record_id}
                >
                  {asset.university_asset_id} · {asset.product_name}
                </option>
              ))}
            </select>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Retirement case title"
            />
            <Input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Technical or lifecycle reason"
            />
            <div className="md:col-span-3 flex justify-end">
              <Button onClick={() => void create()}>
                Create case and hold asset
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      <Card className="border-amber-200 bg-amber-50/60">
        <CardContent className="flex gap-3 p-4 text-sm text-amber-950">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            Retirement approval, physical disposition and Finance/GL write-off
            are independent facts. A completion certificate is unavailable until
            every applicable physical, sanitization and settlement gate passes.
          </p>
        </CardContent>
      </Card>
      <div className="flex flex-wrap gap-2">
        {(
          [
            "queue",
            "sanitization",
            "disposition",
            "reconciliation",
            "closed",
          ] as const
        ).map((value) => (
          <Button
            key={value}
            variant={tab === value ? "default" : "outline"}
            onClick={() => setTab(value)}
          >
            {label(value)}
          </Button>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Scoped retirement lifecycle</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {shown.map((item) => (
            <button
              key={item.retirement_case_id}
              onClick={() => void open(item.retirement_case_id)}
              className="grid w-full gap-2 rounded-lg border p-4 text-left transition hover:border-emerald-300 md:grid-cols-[1fr_auto_auto]"
            >
              <div>
                <strong>
                  {item.case_number} · {item.title}
                </strong>
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.asset_ids ?? `${item.asset_count ?? 0} asset(s)`} ·{" "}
                  {item.retirement_reason}
                </p>
              </div>
              <Badge variant="outline">{label(item.workflow_status)}</Badge>
              <div className="text-right text-xs text-muted-foreground">
                <p>{label(item.physical_status)}</p>
                <p>{label(item.finance_status)}</p>
              </div>
            </button>
          ))}
          {!shown.length && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No retirement cases in this view.
            </p>
          )}
        </CardContent>
      </Card>
      {selected && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>
              {selected.case_number} · {selected.title}
            </CardTitle>
            <Button variant="ghost" onClick={() => setSelected(null)}>
              Close
            </Button>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Workflow", selected.workflow_status],
                ["Physical", selected.physical_status],
                ["Finance", selected.finance_status],
                ["Sanitization", selected.sanitization_status],
              ].map(([name, value]) => (
                <div key={name} className="rounded-lg border p-3">
                  <p className="text-xs uppercase text-muted-foreground">
                    {name}
                  </p>
                  <p className="mt-1 font-semibold">{label(value)}</p>
                </div>
              ))}
            </div>
            <div className="rounded-lg border p-4">
              <h3 className="font-semibold">Exact asset manifest</h3>
              <div className="mt-2 space-y-2">
                {(selected.allocations ?? []).map((allocation) => (
                  <div
                    key={String(allocation.retirement_allocation_id)}
                    className="flex justify-between text-sm"
                  >
                    <span>
                      {String(
                        allocation.university_asset_id ??
                          allocation.inventory_record_id,
                      )}{" "}
                      · {String(allocation.product_name ?? "")}
                    </span>
                    <Badge variant="outline">
                      {label(String(allocation.status))}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border p-4">
                <DatabaseZap className="h-5 w-5 text-blue-600" />
                <p className="mt-2 font-semibold">Sanitization evidence</p>
                <p className="text-sm text-muted-foreground">
                  {selected.sanitization?.length ?? 0} immutable job(s)
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <BadgeIndianRupee className="h-5 w-5 text-amber-600" />
                <p className="mt-2 font-semibold">Finance projections</p>
                <p className="text-sm text-muted-foreground">
                  {selected.finance_projections?.length ?? 0} posting event(s)
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <FileCheck2 className="h-5 w-5 text-emerald-600" />
                <p className="mt-2 font-semibold">Lifecycle certificate</p>
                <p className="text-sm text-muted-foreground">
                  {selected.certificates?.length
                    ? "Issued and signed"
                    : "Pending final gates"}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {selected.workflow_status === "ASSESSMENT" && (
                <Button
                  onClick={() =>
                    void mutate(
                      () =>
                        api.assess(
                          selected.retirement_case_id,
                          selected.aggregate_revision,
                          {
                            technical_condition: { condition: "END_OF_LIFE" },
                            age_and_useful_life: { reviewed: true },
                            redeployment_assessment: { eligible: false },
                            legal_holds: [],
                            environmental_classification: { reviewed: true },
                            data_classification: { data_bearing: false },
                            recommended_disposition: "CERTIFIED_RECYCLING",
                            currency: "INR",
                          },
                        ),
                      "Assessment snapshot recorded",
                    )
                  }
                >
                  Record assessment
                </Button>
              )}
              {selected.workflow_status === "ASSESSMENT" && (
                <Button
                  variant="outline"
                  onClick={() =>
                    void mutate(
                      () =>
                        api.financialSnapshot(
                          selected.retirement_case_id,
                          selected.aggregate_revision,
                          {
                            capitalized_cost: 0,
                            accumulated_depreciation: 0,
                            net_book_value: 0,
                            salvage_value: 0,
                            currency: "INR",
                            source_reference: { source: "FINANCE_GL" },
                            source_revision: 1,
                          },
                        ),
                      "Finance snapshot recorded",
                    )
                  }
                >
                  Finance snapshot
                </Button>
              )}
              {selected.workflow_status === "ASSESSMENT" && (
                <Button
                  variant="outline"
                  onClick={() =>
                    void mutate(
                      () =>
                        api.submitDofa(
                          selected.retirement_case_id,
                          selected.aggregate_revision,
                        ),
                      "Submitted to universal DoFA",
                    )
                  }
                >
                  Submit to DoFA
                </Button>
              )}
              {selected.physical_status === "PHYSICAL_COMPLETED" &&
                !["SETTLED", "NOT_APPLICABLE"].includes(
                  selected.finance_status,
                ) && (
                  <Button
                    onClick={() =>
                      void mutate(
                        () =>
                          api.requestFinance(
                            selected.retirement_case_id,
                            selected.aggregate_revision,
                          ),
                        "Finance posting requested",
                      )
                    }
                  >
                    Request Finance posting
                  </Button>
                )}
              {selected.physical_status === "PHYSICAL_COMPLETED" &&
                ["SETTLED", "NOT_APPLICABLE"].includes(
                  selected.finance_status,
                ) && (
                  <Button
                    onClick={() =>
                      void mutate(
                        () =>
                          api.issueCertificate(
                            selected.retirement_case_id,
                            selected.aggregate_revision,
                          ),
                        "Lifecycle certificate issued",
                      )
                    }
                  >
                    Issue completion certificate
                  </Button>
                )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
