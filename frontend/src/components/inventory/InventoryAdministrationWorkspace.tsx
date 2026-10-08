"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthedApi } from "@/lib/api";
import { createInventoryApi } from "@/lib/api/api.inventory";
import { toast } from "@/lib/notifications/falcon-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function InventoryAdministrationWorkspace() {
  const authed = useAuthedApi();
  const api = useMemo(() => createInventoryApi(authed), [authed]);
  const [policies, setPolicies] = useState<{
    identifier_policy: Record<string, unknown> | null;
    category_policies: Record<string, unknown>[];
  } | null>(null);
  const [legacy, setLegacy] = useState<Record<string, unknown>[]>([]);
  const [candidate, setCandidate] = useState<Record<string, string>>({});
  const reload = useCallback(
    () =>
      Promise.all([api.policies(), api.legacyQueue()])
        .then(([nextPolicies, nextLegacy]) => {
          setPolicies(nextPolicies);
          setLegacy(nextLegacy);
        })
        .catch((error) =>
          toast.error(
            error instanceof Error
              ? error.message
              : "Unable to load inventory administration",
          ),
        ),
    [api],
  );
  useEffect(() => void reload(), [reload]);
  async function reconcile(row: Record<string, unknown>) {
    const key = String(row.legacy_record_id);
    const inventoryId = candidate[key]?.trim();
    if (!inventoryId)
      return toast.error("Enter a candidate Module 5 record UUID");
    try {
      await api.reconcileLegacy({
        legacy_source: row.legacy_source,
        legacy_record_id: row.legacy_record_id,
        candidate_inventory_record_id: inventoryId,
        decision: "RECONCILED",
        reason: "Approved legacy identity reconciliation",
      });
      toast.success("Legacy record reconciled without merging identities");
      await reload();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Reconciliation failed",
      );
    }
  }
  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-2xl font-black">
          Inventory policies & reconciliation
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Published identity rules and controlled one-way adoption of legacy
          records.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Published policies</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Identifier policy version:{" "}
            <strong>
              {String(
                policies?.identifier_policy?.policy_version ?? "Unavailable",
              )}
            </strong>
          </p>
          {(policies?.category_policies ?? []).map((policy) => (
            <div
              key={String(policy.category_policy_id)}
              className="flex flex-wrap gap-2 rounded border p-3"
            >
              <Badge variant="outline">{String(policy.subject_type)}</Badge>
              <strong>{String(policy.category)}</strong>
              <span>v{String(policy.policy_version)}</span>
              <span>RFID {policy.rfid_required ? "required" : "optional"}</span>
              <span>
                Serial{" "}
                {policy.manufacturer_serial_required ? "required" : "optional"}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Legacy reconciliation queue</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {legacy.map((row) => {
            const key = String(row.legacy_record_id);
            return (
              <div
                key={`${String(row.legacy_source)}-${key}`}
                className="grid gap-2 rounded border p-3 lg:grid-cols-[1fr_1fr_auto] lg:items-center"
              >
                <div>
                  <strong>{String(row.name)}</strong>
                  <p className="text-xs text-muted-foreground">
                    {String(row.legacy_source)} · {String(row.legacy_code)} ·{" "}
                    {String(row.reconciliation_status)}
                  </p>
                </div>
                <Input
                  aria-label={`Candidate inventory record for ${String(row.legacy_code)}`}
                  placeholder="Candidate Module 5 inventory UUID"
                  value={candidate[key] ?? ""}
                  onChange={(event) =>
                    setCandidate((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }))
                  }
                />
                <Button variant="outline" onClick={() => void reconcile(row)}>
                  Approve reconciliation
                </Button>
              </div>
            );
          })}
          {!legacy.length && (
            <p className="text-sm text-muted-foreground">
              No legacy records require review.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
