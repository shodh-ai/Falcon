"use client";

import Link from "next/link";
import QRCode from "react-qr-code";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Camera, CheckCircle2, MapPin, RefreshCw, ScanLine, ShieldAlert, Video } from "lucide-react";
import { useAuthedApi } from "@/lib/api";
import { createProductVerificationApi, type ProductVerificationCaseDetail } from "@/lib/api/api.product-verification";
import { toast } from "@/lib/notifications/falcon-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";

const value = (record: Record<string, unknown>, key: string) => record[key];
const text = (record: Record<string, unknown>, key: string) => String(record[key] ?? "");

export function ProductVerificationCaseWorkspace({ caseId }: { caseId: string }) {
  const authed = useAuthedApi();
  const api = useMemo(() => createProductVerificationApi(authed), [authed]);
  const [detail, setDetail] = useState<ProductVerificationCaseDetail | null>(null);
  const [selectedSubject, setSelectedSubject] = useState("");
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [lotQuantity, setLotQuantity] = useState("");
  const [lotBatch, setLotBatch] = useState("");
  const [observed, setObserved] = useState<Record<string, string>>({});
  const [capture, setCapture] = useState<{ sessionId: string; nonce: string; requiredViews: string[]; nextView: number; revision: number } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const reload = useCallback(
    () => api.get(caseId).then((row) => {
      setDetail(row);
      if (!selectedSubject && row.subjects[0]) setSelectedSubject(text(row.subjects[0], "subject_id"));
    }).catch((error) => toast.error(error.message)),
    [api, caseId, selectedSubject],
  );
  useEffect(() => void reload(), [reload]);
  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);

  const subject = detail?.subjects.find((item) => text(item, "subject_id") === selectedSubject);
  const latestAnalysis = [...(detail?.analyses ?? [])].reverse().find((item) => text(item, "subject_id") === selectedSubject);
  const identity = [...(detail?.identities ?? [])].reverse().find((item) => text(item, "subject_id") === selectedSubject);
  const subjectEvidence = detail?.evidence.filter((item) => text(item, "subject_id") === selectedSubject) ?? [];

  async function mutate(work: () => Promise<unknown>) {
    setBusy(true);
    try { await work(); await reload(); }
    catch (error) { toast.error(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  async function startCapture() {
    if (!detail || !selectedSubject) return;
    setBusy(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("This device does not expose a live camera. Request a supervised capture exception.");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      const session = await api.createSession(caseId, selectedSubject, Number(detail.aggregate_revision));
      setCapture({ sessionId: session.capture_session_id, nonce: session.nonce, requiredViews: session.required_views, nextView: 0, revision: session.aggregate_revision });
    } catch (error) { toast.error(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  async function captureView() {
    if (!capture || !videoRef.current) return;
    const video = videoRef.current;
    if (!video.videoWidth || !video.videoHeight) return toast.error("Wait for the camera preview to become ready");
    setBusy(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")?.drawImage(video, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Camera capture failed")), "image/jpeg", 0.92));
      const position = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 12_000, maximumAge: 0 }));
      const view = capture.requiredViews[capture.nextView];
      const form = new FormData();
      form.append("file", blob, `${view.toLowerCase()}.jpg`);
      form.append("latitude", String(position.coords.latitude));
      form.append("longitude", String(position.coords.longitude));
      form.append("accuracy_metres", String(position.coords.accuracy));
      form.append("client_captured_at", new Date().toISOString());
      form.append("device_metadata", JSON.stringify({ platform: navigator.platform, user_agent_family: navigator.userAgent.split(" ")[0], capture_api: "getUserMedia" }));
      let fingerprint = sessionStorage.getItem("pv_capture_fingerprint");
      if (!fingerprint) { fingerprint = crypto.randomUUID(); sessionStorage.setItem("pv_capture_fingerprint", fingerprint); }
      const result = await api.uploadEvidence(caseId, capture.sessionId, view, capture.nonce, fingerprint, form) as { aggregate_revision: number };
      setCapture({ ...capture, nextView: capture.nextView + 1, revision: result.aggregate_revision });
      toast.success(`${view.replaceAll("_", " ")} captured`);
    } catch (error) { toast.error(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  async function completeCapture() {
    if (!capture) return;
    await mutate(async () => {
      await api.completeSession(caseId, capture.sessionId, capture.revision, capture.nonce);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setCapture(null);
    });
  }

  if (!detail) return <div className="p-8 text-sm text-muted-foreground">Loading physical-verification case…</div>;
  const context = detail.context ?? {};
  const coverage = Number(value(latestAnalysis ?? {}, "coverage_score") ?? 0);
  const confidence = Number(value(latestAnalysis ?? {}, "confidence_score") ?? 0);
  const publicUrl = identity && typeof window !== "undefined" ? `${window.location.origin}/api/product-verification/v1/verify/${text(identity, "verification_code")}` : "";

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><Link href="/finance/product-verification" className="mb-2 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-1 h-4 w-4" />Physical verification</Link><h1 className="text-2xl font-black">{text(context, "product_name")}</h1><p className="text-sm text-muted-foreground">{text(context, "order_number")} · {text(context, "receipt_number")} · {detail.subject_type}</p></div>
        <div className="flex items-center gap-2"><Badge variant={detail.workflow_state === "CLOSED" ? "success" : detail.workflow_state === "MANUAL_REVIEW" ? "warning" : "outline"}>{detail.workflow_state.replaceAll("_", " ")}</Badge><Button variant="outline" onClick={() => void reload()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <Card><CardHeader><CardTitle>Physical subjects</CardTitle></CardHeader><CardContent className="space-y-2">
          {detail.subjects.map((item) => {
            const id = text(item, "subject_id");
            const activeIdentity = detail.identities.find((candidate) => text(candidate, "subject_id") === id && text(candidate, "status") === "ACTIVE");
            return <button key={id} className={`w-full rounded-lg border p-3 text-left ${selectedSubject === id ? "border-blue-500 bg-blue-50" : ""}`} onClick={() => setSelectedSubject(id)}><div className="flex items-center justify-between"><strong>#{text(item, "subject_sequence")}</strong><Badge variant={activeIdentity ? "success" : text(item, "status") === "REJECTED" ? "destructive" : "outline"}>{activeIdentity ? "VERIFIED" : text(item, "status")}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{Number(value(item, "subject_quantity"))} {text(item, "unit_of_measure")}{value(item, "batch_number") ? ` · batch ${text(item, "batch_number")}` : ""}</p></button>;
          })}
          {detail.subject_type === "LOT" && <div className="space-y-2 rounded-lg border border-dashed p-3"><p className="text-xs font-semibold uppercase text-muted-foreground">Add consumable lot</p><Input placeholder="Observed quantity" inputMode="decimal" value={lotQuantity} onChange={(event) => setLotQuantity(event.target.value)} /><Input placeholder="Batch number" value={lotBatch} onChange={(event) => setLotBatch(event.target.value)} /><Button size="sm" disabled={busy || !lotQuantity} onClick={() => void mutate(() => api.createLot(caseId, Number(detail.aggregate_revision), { observed_quantity: Number(lotQuantity), unit_of_measure: detail.unit_of_measure, batch_number: lotBatch || undefined }))}>Create immutable lot</Button></div>}
        </CardContent></Card>

        <div className="space-y-4">
          {subject ? <>
            <Card><CardHeader><CardTitle className="flex items-center gap-2"><ScanLine className="h-5 w-5" />Reference and invoice binding</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2"><div className="rounded-lg bg-slate-50 p-3 text-sm"><p><strong>Expected brand:</strong> {text(context, "brand") || "Not specified"}</p><p><strong>Model:</strong> {text(context, "model_number") || "Not specified"}</p><p><strong>Part number:</strong> {text(context, "part_number") || "Not specified"}</p><p><strong>Quantity:</strong> {Number(value(subject, "subject_quantity"))} {text(subject, "unit_of_measure")}</p></div><div className="space-y-2"><p className="text-sm font-semibold">Current Module 3-cleared invoice line</p>{detail.eligible_invoice_lines.map((line) => <Button key={text(line, "invoice_line_id")} size="sm" variant="outline" disabled={busy || !["CLEARED_AUTOMATED", "CLEARED_HUMAN"].includes(text(line, "integrity_decision"))} onClick={() => void mutate(() => api.allocateInvoice(caseId, selectedSubject, Number(detail.aggregate_revision), text(line, "invoice_line_id"), Number(value(subject, "subject_quantity"))))}>{text(line, "invoice_number")} · rev {text(line, "invoice_revision")} · {text(line, "integrity_decision") || "NOT CLEARED"}</Button>)}</div></CardContent></Card>

            <Card><CardHeader><CardTitle className="flex items-center gap-2"><Camera className="h-5 w-5" />Trusted live capture</CardTitle></CardHeader><CardContent className="space-y-3"><div className="grid gap-3 md:grid-cols-2"><div className="overflow-hidden rounded-lg bg-slate-950"><video ref={videoRef} autoPlay muted playsInline className="aspect-video w-full object-cover" /></div><div className="space-y-3"><div className="flex items-center gap-2 text-sm"><MapPin className="h-4 w-4 text-blue-600" />GPS accuracy and policy geofence are validated server-side.</div><div className="flex items-center gap-2 text-sm"><Video className="h-4 w-4 text-blue-600" />Original bytes are privately retained and hash-bound.</div>{!capture ? <Button disabled={busy} onClick={() => void startCapture()}><Camera className="mr-2 h-4 w-4" />Start 15-minute session</Button> : <><p className="text-sm">Required view {Math.min(capture.nextView + 1, capture.requiredViews.length)} of {capture.requiredViews.length}: <strong>{capture.requiredViews[capture.nextView]?.replaceAll("_", " ") ?? "complete"}</strong></p><Progress value={(capture.nextView / capture.requiredViews.length) * 100} />{capture.nextView < capture.requiredViews.length ? <Button disabled={busy} onClick={() => void captureView()}>Capture required view</Button> : <Button disabled={busy} onClick={() => void completeCapture()}>Seal capture session</Button>}</>}</div></div><p className="text-xs text-muted-foreground">{subjectEvidence.length} immutable evidence object(s) currently linked to this subject.</p></CardContent></Card>

            <Card><CardHeader><CardTitle>Observed attributes and analysis</CardTitle></CardHeader><CardContent className="space-y-3"><div className="grid gap-2 md:grid-cols-2">{["brand", "model", ...(detail.subject_type === "ITEM" ? ["serial", "technical_specifications"] : ["batch_number", "specifications"]), "quantity"].map((name) => <Input key={name} placeholder={name.replaceAll("_", " ")} value={observed[name] ?? (name === "quantity" ? text(subject, "subject_quantity") : "")} onChange={(event) => setObserved((state) => ({ ...state, [name]: event.target.value }))} />)}</div><Button disabled={busy} onClick={() => void mutate(() => api.analyze(caseId, selectedSubject, Number(detail.aggregate_revision), Object.entries({ ...observed, quantity: observed.quantity ?? Number(value(subject, "subject_quantity")) }).map(([attribute_name, raw]) => ({ attribute_name, value: attribute_name === "quantity" ? Number(raw) : raw, extraction_method: "HUMAN_CONFIRMED_CAPTURE", extraction_confidence: 95 }))))}>Run policy-pinned analysis</Button>{latestAnalysis && <div className="grid gap-3 md:grid-cols-3"><div className="rounded-lg border p-3"><p className="text-xs uppercase text-muted-foreground">Result</p><p className="font-bold">{text(latestAnalysis, "analysis_result")}</p></div><div className="rounded-lg border p-3"><p className="text-xs uppercase text-muted-foreground">Coverage</p><Progress className="mt-2" value={coverage} /><p className="mt-1 text-sm">{coverage}%</p></div><div className="rounded-lg border p-3"><p className="text-xs uppercase text-muted-foreground">Confidence</p><Progress className="mt-2" value={confidence} /><p className="mt-1 text-sm">{confidence}%</p></div></div>}</CardContent></Card>

            <Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5" />Independent review</CardTitle></CardHeader><CardContent className="space-y-3"><Textarea placeholder="Permanent decision or evidence-request reason" value={reason} onChange={(event) => setReason(event.target.value)} /><div className="flex flex-wrap gap-2"><Button disabled={busy || !reason} onClick={() => void mutate(() => api.review(caseId, selectedSubject, Number(detail.aggregate_revision), "CLEAR", reason))}>Clear after review</Button><Button variant="destructive" disabled={busy || !reason} onClick={() => void mutate(() => api.review(caseId, selectedSubject, Number(detail.aggregate_revision), "REJECT", reason))}>Reject</Button><Button variant="outline" disabled={busy || !reason} onClick={() => void mutate(() => api.review(caseId, selectedSubject, Number(detail.aggregate_revision), "REQUEST_EVIDENCE", reason))}>Request evidence</Button><Button variant="outline" disabled={busy || !reason} onClick={() => void mutate(() => api.review(caseId, selectedSubject, Number(detail.aggregate_revision), "REQUEST_EXCEPTION", reason))}>Recommend exception</Button></div></CardContent></Card>

            {identity && <Card><CardHeader><CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-600" />Signed verification identity</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-[160px_1fr]"><div className="rounded-lg border bg-white p-3">{publicUrl && <QRCode value={publicUrl} size={130} />}</div><div className="space-y-2 text-sm"><div className="flex items-center gap-2"><strong>{text(identity, "verification_code")}</strong><Badge variant={text(identity, "status") === "ACTIVE" ? "success" : "destructive"}>{text(identity, "status")}</Badge></div><p>Revision {text(identity, "verification_revision")} · Ed25519 key {text(identity, "signing_key_version")}</p><p className="break-all text-xs text-muted-foreground">Record hash: {text(identity, "verification_record_hash")}</p><p className="text-xs text-muted-foreground">The QR signature proves issuance. Current validity is always checked online.</p>{text(identity, "status") === "ACTIVE" && <Button variant="outline" disabled={busy || !reason} onClick={() => void mutate(() => api.reconsider(caseId, selectedSubject, Number(detail.aggregate_revision), reason))}>Open reconsideration and revoke</Button>}</div></CardContent></Card>}
          </> : <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Choose or create a physical subject.</CardContent></Card>}
        </div>
      </div>
    </div>
  );
}
