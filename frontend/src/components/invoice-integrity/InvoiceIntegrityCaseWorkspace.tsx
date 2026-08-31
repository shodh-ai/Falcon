"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, FileSearch, ShieldAlert, ShieldCheck } from "lucide-react";
import { useAuthedApi } from "@/lib/api";
import {
  createInvoiceIntegrityApi,
  type IntegrityCaseDetail,
} from "@/lib/api/api.invoice-integrity";
import { toast } from "@/lib/notifications/falcon-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const text = (value: unknown) =>
  value == null ? "—" : String(value).replaceAll("_", " ");

export function InvoiceIntegrityCaseWorkspace({ caseId }: { caseId: string }) {
  const authed = useAuthedApi();
  const api = useMemo(() => createInvoiceIntegrityApi(authed), [authed]);
  const [detail, setDetail] = useState<IntegrityCaseDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [otp, setOtp] = useState("");
  const [stepUpVerified, setStepUpVerified] = useState(false);
  const reload = useCallback(
    () =>
      api
        .get(caseId)
        .then(setDetail)
        .catch((error) => toast.error(error.message)),
    [api, caseId],
  );
  useEffect(() => void reload(), [reload]);
  const act = async (work: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try {
      await work();
      toast.success(message);
      setReason("");
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  if (!detail)
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Loading invoice-integrity case…
      </div>
    );
  const revision = Number(detail.aggregate_revision);
  const investigation = [...detail.investigations]
    .reverse()
    .find((item) => item.status !== "CANCELLED") as
    | Record<string, unknown>
    | undefined;
  const risk = detail.risk_assessments.at(-1) as
    | Record<string, unknown>
    | undefined;
  return (
    <div className="space-y-6 p-6">
      <Link
        href="/finance/invoice-integrity"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-1 h-4 w-4" />
        Integrity queue
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black">
              Invoice {detail.invoice_number}
            </h1>
            <Badge
              variant={
                detail.workflow_state === "CLOSED" ? "success" : "warning"
              }
            >
              {text(detail.workflow_state)}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {detail.vendor_name} · exact invoice revision{" "}
            {detail.invoice_revision} · case revision {revision}
          </p>
        </div>
        <Button
          disabled={
            busy ||
            ["CLOSED", "SUPERSEDED", "CANCELLED"].includes(
              detail.workflow_state,
            )
          }
          onClick={() =>
            void act(
              () => api.analyze(caseId, revision),
              "Deterministic analysis completed",
            )
          }
        >
          <FileSearch className="mr-2 h-4 w-4" />
          Run analysis
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        {(
          [
            ["Trust", detail.trust_level],
            ["Analysis", detail.analysis_result],
            ["Risk", risk?.risk_score ?? "Pending"],
            [
              "Coverage / confidence",
              risk
                ? `${risk.coverage_score}% / ${risk.confidence_score}%`
                : "Pending",
            ],
          ] as Array<[string, unknown]>
        ).map(([label, value]) => (
          <Card key={label}>
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                {label}
              </p>
              <p className="mt-2 font-bold">{text(value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      {!!detail.blockers.length && (
        <Card className="border-amber-300">
          <CardHeader>
            <CardTitle className="flex items-center text-base">
              <ShieldAlert className="mr-2 h-4 w-4" />
              Integrity blockers
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {detail.blockers.map((blocker) => (
              <div
                key={String(blocker.blocker_id)}
                className="rounded border p-3 text-sm"
              >
                <strong>{text(blocker.blocker_type)}</strong>
                <p className="mt-1 text-muted-foreground">
                  A blocker prevents automated clearance. A human clearance
                  records an immutable resolution; the finding remains in
                  history.
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <Tabs defaultValue="evidence">
        <TabsList>
          <TabsTrigger value="evidence">Evidence</TabsTrigger>
          <TabsTrigger value="comparison">Comparison</TabsTrigger>
          <TabsTrigger value="investigation">Investigation</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>
        <TabsContent value="evidence">
          <Card>
            <CardHeader>
              <CardTitle>Immutable evidence set</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {detail.evidence.map((item) => (
                <div
                  key={String(item.evidence_id)}
                  className="rounded border p-3 text-sm"
                >
                  <strong>{text(item.evidence_type)}</strong>
                  <p className="font-mono text-xs text-muted-foreground">
                    SHA-256 {text(item.content_hash)}
                  </p>
                </div>
              ))}
              {!detail.evidence.length && (
                <p className="text-sm text-muted-foreground">
                  No evidence captured yet.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="comparison">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Source snapshots</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {detail.source_snapshots.map((item) => (
                  <div
                    key={String(item.source_snapshot_id)}
                    className="rounded border p-3 text-sm"
                  >
                    <strong>{text(item.source_platform)}</strong>
                    <p>{text(item.external_transaction_id)}</p>
                    <p className="text-xs text-muted-foreground">
                      {text(item.retrieval_method)}
                    </p>
                  </div>
                ))}
                {!detail.source_snapshots.length && (
                  <p className="text-sm text-muted-foreground">
                    Authoritative source evidence unavailable.
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Field differences</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {detail.comparisons.map((item) => (
                  <div
                    key={String(item.comparison_id)}
                    className="rounded border p-3 text-sm"
                  >
                    <strong>{text(item.field_name)}</strong>
                    <p>{text(item.result)}</p>
                  </div>
                ))}
                {!detail.comparisons.length && (
                  <p className="text-sm text-muted-foreground">
                    Run analysis to compare invoice, order, and source facts.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="investigation">
          <Card>
            <CardHeader>
              <CardTitle>Independent investigation and certification</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded border bg-slate-50 p-3">
                <p className="text-sm font-semibold">
                  MFA step-up for certification
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {!challengeId ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          const challenge = await api.requestStepUp(
                            caseId,
                            "CERTIFICATION",
                          );
                          setChallengeId(challenge.challenge_id);
                          if (challenge.dev_otp) setOtp(challenge.dev_otp);
                        }, "Verification code requested")
                      }
                    >
                      Request verification code
                    </Button>
                  ) : (
                    <>
                      <Input
                        className="max-w-48"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="6-digit code"
                        value={otp}
                        onChange={(event) =>
                          setOtp(event.target.value.replace(/\D/g, ""))
                        }
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy || otp.length !== 6}
                        onClick={() =>
                          void act(async () => {
                            await api.verifyStepUp(caseId, challengeId, otp);
                            setStepUpVerified(true);
                          }, "MFA verified")
                        }
                      >
                        Verify
                      </Button>
                    </>
                  )}
                  {stepUpVerified && (
                    <Badge variant="success">Verified for 10 minutes</Badge>
                  )}
                </div>
              </div>
              <Input
                placeholder="Restricted recommendation or certification reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
              {!investigation && (
                <Button
                  disabled={busy}
                  variant="outline"
                  onClick={() =>
                    void act(
                      () => api.openInvestigation(caseId, revision, reason),
                      "Investigation opened",
                    )
                  }
                >
                  Open investigation
                </Button>
              )}
              {investigation && investigation.status !== "RECOMMENDED" && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={busy || !reason.trim()}
                    variant="outline"
                    onClick={() =>
                      void act(
                        () =>
                          api.recommend(
                            caseId,
                            String(investigation.investigation_id),
                            revision,
                            "CLEAR",
                            reason,
                          ),
                        "Clearance recommended",
                      )
                    }
                  >
                    Recommend clearance
                  </Button>
                  <Button
                    disabled={busy || !reason.trim()}
                    variant="destructive"
                    onClick={() =>
                      void act(
                        () =>
                          api.recommend(
                            caseId,
                            String(investigation.investigation_id),
                            revision,
                            "REJECT",
                            reason,
                          ),
                        "Rejection recommended",
                      )
                    }
                  >
                    Recommend rejection
                  </Button>
                </div>
              )}
              {investigation?.status === "RECOMMENDED" && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={busy || !reason.trim() || !stepUpVerified}
                    onClick={() =>
                      void act(
                        () =>
                          api.certify(
                            caseId,
                            revision,
                            String(investigation.investigation_id),
                            "CLEARED_HUMAN",
                            reason,
                          ),
                        "Invoice integrity cleared",
                      )
                    }
                  >
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Certify clearance
                  </Button>
                  <Button
                    disabled={busy || !reason.trim() || !stepUpVerified}
                    variant="destructive"
                    onClick={() =>
                      void act(
                        () =>
                          api.certify(
                            caseId,
                            revision,
                            String(investigation.investigation_id),
                            "REJECTED_UNRESOLVED",
                            reason,
                          ),
                        "Invoice integrity rejected",
                      )
                    }
                  >
                    Certify rejection
                  </Button>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                The server enforces submitter ≠ investigator ≠ certifier ≠
                payment poster and requires recent MFA for certification.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="timeline">
          <Card>
            <CardHeader>
              <CardTitle>Hash-chained integrity timeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {detail.audit_timeline.map((item) => (
                <div
                  key={String(item.audit_event_id)}
                  className="rounded border-l-4 border-blue-300 bg-slate-50 p-3 text-sm"
                >
                  <strong>{text(item.event_type)}</strong>
                  <p className="text-xs text-muted-foreground">
                    revision {text(item.case_revision)} ·{" "}
                    {text(item.created_at)}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
