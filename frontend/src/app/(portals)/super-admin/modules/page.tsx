"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useAuthedApi } from "@/lib/api";
import { toast } from "@/lib/notifications/falcon-toast";
import { useModuleRuntime } from "@/context/ModuleRuntimeContext";
import type {
  BusinessModuleKey,
  ModuleLaunchState,
} from "@/lib/launch-modules";

type CatalogueItem = {
  moduleKey: BusinessModuleKey;
  displayName: string;
  version: string;
  businessOwnerRoles: string[];
  dependencyEdges: Array<{ moduleKey: BusinessModuleKey; kind: string }>;
};
type Rollout = {
  rollout_id: string;
  module_key: BusinessModuleKey;
  desired_state: ModuleLaunchState;
  scope_type: string;
  status: string;
  proposer_id: string;
  revision: number;
  reason: string;
};

const stateVariant = (state: string) =>
  state === "ACTIVE"
    ? "success"
    : state === "PAUSED"
      ? "destructive"
      : state === "PILOT" || state === "SHADOW"
        ? "warning"
        : "outline";

export default function ModuleLaunchPage() {
  const api = useAuthedApi();
  const runtime = useModuleRuntime();
  const [catalogue, setCatalogue] = useState<CatalogueItem[]>([]);
  const [rollouts, setRollouts] = useState<Rollout[]>([]);
  const [desired, setDesired] = useState<Record<string, ModuleLaunchState>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [items, proposals] = await Promise.all([
      api.get<CatalogueItem[]>("/api/platform/modules"),
      api.get<Rollout[]>("/api/platform/module-rollouts"),
    ]);
    setCatalogue(items);
    setRollouts(proposals);
  }, [api]);

  useEffect(() => {
    void load().catch((error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to load module controls",
      ),
    );
  }, [load]);

  async function propose(item: CatalogueItem) {
    const target = desired[item.moduleKey] ?? "ACTIVE";
    setBusy(item.moduleKey);
    try {
      await api.post(
        "/api/platform/module-rollouts",
        {
          module_key: item.moduleKey,
          scope_type: "TENANT",
          desired_state: target,
          reason: `Tenant ${target.toLowerCase()} proposal from Module Launch Console`,
        },
        { "Idempotency-Key": crypto.randomUUID() },
      );
      toast.success("Rollout draft created. A separate owner must approve it.");
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function transition(rollout: Rollout, action: "submit" | "approve") {
    setBusy(rollout.rollout_id);
    try {
      await api.post(
        `/api/platform/module-rollouts/${rollout.rollout_id}/${action}`,
        {},
        {
          "If-Match": String(rollout.revision),
          "Idempotency-Key": crypto.randomUUID(),
        },
      );
      toast.success(
        action === "submit"
          ? "Rollout submitted"
          : "Rollout approved and applied",
      );
      await Promise.all([load(), runtime.refresh()]);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-sgvu-navy">
          Module Launch Console
        </h1>
        <p className="text-sm text-muted-foreground">
          Independently roll out suites without deployments. Activation and
          resume require a separate business-owner approval.
        </p>
      </div>

      {runtime.degraded ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Runtime manifest is temporarily unavailable. The last known state
          remains in use.
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        {catalogue.map((item) => {
          const current = runtime.module(item.moduleKey);
          return (
            <section
              key={item.moduleKey}
              className="rounded-xl border bg-background p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-sgvu-navy">
                    {item.displayName}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {item.moduleKey} · v{item.version}
                  </p>
                </div>
                <Badge variant={stateVariant(current?.state ?? "OFF")}>
                  {current?.state ?? "OFF"}
                </Badge>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Owner: {item.businessOwnerRoles.join(", ")}
              </p>
              {item.dependencyEdges.length ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Dependencies:{" "}
                  {item.dependencyEdges
                    .map((edge) => `${edge.moduleKey} (${edge.kind})`)
                    .join(", ")}
                </p>
              ) : null}
              <div className="mt-4 flex gap-2">
                <Select
                  value={desired[item.moduleKey] ?? "ACTIVE"}
                  onChange={(event) =>
                    setDesired((old) => ({
                      ...old,
                      [item.moduleKey]: event.target.value,
                    }))
                  }
                >
                  {[
                    "OFF",
                    "SHADOW",
                    "PILOT",
                    "ACTIVE",
                    "DRAINING",
                    "PAUSED",
                  ].map((state) => (
                    <option key={state} value={state}>
                      {state}
                    </option>
                  ))}
                </Select>
                <Button
                  onClick={() => void propose(item)}
                  disabled={busy === item.moduleKey}
                >
                  Create proposal
                </Button>
              </div>
            </section>
          );
        })}
      </div>

      <section className="rounded-xl border bg-background p-4">
        <h2 className="font-semibold text-sgvu-navy">Rollout approvals</h2>
        <div className="mt-3 space-y-2">
          {rollouts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No rollout proposals yet.
            </p>
          ) : (
            rollouts.map((rollout) => (
              <div
                key={rollout.rollout_id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm"
              >
                <div>
                  <span className="font-medium">{rollout.module_key}</span> →{" "}
                  {rollout.desired_state}{" "}
                  <Badge className="ml-2" variant="outline">
                    {rollout.status}
                  </Badge>
                  <p className="text-xs text-muted-foreground">
                    {rollout.reason}
                  </p>
                </div>
                <div className="flex gap-2">
                  {rollout.status === "DRAFT" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === rollout.rollout_id}
                      onClick={() => void transition(rollout, "submit")}
                    >
                      Submit
                    </Button>
                  ) : null}
                  {rollout.status === "SUBMITTED" ? (
                    <Button
                      size="sm"
                      disabled={busy === rollout.rollout_id}
                      onClick={() => void transition(rollout, "approve")}
                    >
                      Approve & apply
                    </Button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
