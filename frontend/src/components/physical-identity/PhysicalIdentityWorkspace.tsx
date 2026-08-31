"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Cpu, Nfc, RefreshCw, ShieldCheck } from "lucide-react";
import { useAuthedApi } from "@/lib/api";
import {
  createPhysicalIdentityApi,
  type EligiblePhysicalAsset,
  type PhysicalIdentityDashboard,
  type ProvisioningJob,
} from "@/lib/api/api.physical-identity";
import { toast } from "@/lib/notifications/falcon-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type View = "jobs" | "verify" | "devices" | "gates";

export function PhysicalIdentityWorkspace() {
  const authed = useAuthedApi();
  const api = useMemo(() => createPhysicalIdentityApi(authed), [authed]);
  const [dashboard, setDashboard] = useState<PhysicalIdentityDashboard | null>(null);
  const [jobs, setJobs] = useState<ProvisioningJob[]>([]);
  const [assets, setAssets] = useState<EligiblePhysicalAsset[]>([]);
  const [devices, setDevices] = useState<Record<string, unknown>[]>([]);
  const [alerts, setAlerts] = useState<Record<string, unknown>[]>([]);
  const [view, setView] = useState<View>("jobs");
  const [assetId, setAssetId] = useState("");
  const [jobType, setJobType] = useState<"NEW" | "RETROFIT" | "REPLACEMENT">("NEW");
  const [selectedJob, setSelectedJob] = useState("");
  const [assetCode, setAssetCode] = useState("");
  const [tagUid, setTagUid] = useState("");
  const [rfidHash, setRfidHash] = useState("");
  const [qrHash, setQrHash] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    return Promise.all([
      api.dashboard(),
      api.jobs(),
      api.eligibleAssets(),
      api.devices(),
      api.gateAlerts(),
    ])
      .then(([summary, jobRows, assetRows, deviceRows, alertRows]) => {
        setDashboard(summary);
        setJobs(jobRows);
        setAssets(assetRows);
        setDevices(deviceRows);
        setAlerts(alertRows);
      })
      .catch((error) => toast.error(error.message));
  }, [api]);
  useEffect(() => void reload(), [reload]);

  const verificationJob = jobs.find((job) => job.provisioning_job_id === selectedJob);
  const createJob = async () => {
    if (!assetId) return toast.error("Select an exact Module 5 asset");
    setBusy(true);
    try {
      await api.requestJob(assetId, { job_type: jobType });
      toast.success("Signed one-time provisioning job created");
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Provisioning failed");
    } finally {
      setBusy(false);
    }
  };
  const verify = async () => {
    if (!verificationJob) return toast.error("Select a verification-pending job");
    setBusy(true);
    try {
      await api.verifyAttachment(
        verificationJob.provisioning_job_id,
        verificationJob.aggregate_revision,
        {
          decision: "VERIFIED",
          scanned_asset_id: assetCode,
          scanned_qr_payload_hash: qrHash,
          ...(verificationJob.logical_rfid_code
            ? { scanned_physical_tag_uid: tagUid, scanned_rfid_payload_hash: rfidHash }
            : {}),
          evidence_manifest: [{ method: "INDEPENDENT_LIVE_SCAN", captured_at: new Date().toISOString() }],
        },
      );
      toast.success("Physical attachment independently verified");
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  };
  const cards = [
    ["Active jobs", dashboard?.active_jobs ?? 0, Nfc],
    ["Awaiting verification", dashboard?.awaiting_verification ?? 0, ShieldCheck],
    ["Healthy devices", dashboard?.devices?.healthy ?? 0, Cpu],
    ["Open gate alerts", dashboard?.open_alerts ?? 0, AlertTriangle],
  ] as const;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Physical Identity & Gate Observation</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Execute Module 5-authored RFID and label jobs, independently verify attachment, and review gate observations without creating inventory or movement authority.
          </p>
        </div>
        <Button variant="outline" onClick={() => void reload()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        {cards.map(([label, value, Icon]) => (
          <Card key={label}><CardContent className="p-4"><div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase text-muted-foreground">{label}</span><Icon className="h-4 w-4 text-blue-600" /></div><p className="mt-2 text-2xl font-black">{value}</p></CardContent></Card>
        ))}
      </div>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Physical identity workspaces">
        {(["jobs", "verify", "devices", "gates"] as View[]).map((tab) => <Button key={tab} variant={view === tab ? "default" : "outline"} onClick={() => setView(tab)}>{tab === "gates" ? "Gate alerts" : tab[0].toUpperCase() + tab.slice(1)}</Button>)}
      </div>

      {view === "jobs" && <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card><CardHeader><CardTitle>Create signed provisioning job</CardTitle></CardHeader><CardContent className="space-y-3">
          <select className="w-full rounded-md border p-2 text-sm" value={assetId} onChange={(event) => setAssetId(event.target.value)} aria-label="Module 5 asset">
            <option value="">Select exact asset</option>{assets.map((asset) => <option key={asset.inventory_record_id} value={asset.inventory_record_id}>{asset.university_asset_id} · {asset.product_name}</option>)}
          </select>
          <select className="w-full rounded-md border p-2 text-sm" value={jobType} onChange={(event) => setJobType(event.target.value as typeof jobType)} aria-label="Provisioning job type"><option>NEW</option><option>RETROFIT</option><option>REPLACEMENT</option></select>
          <p className="text-xs text-muted-foreground">The kiosk receives the exact signed identity. Operators cannot enter or change Asset/RFID IDs.</p>
          <Button className="w-full" disabled={busy || !assetId} onClick={() => void createJob()}>Authorize 15-minute job</Button>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Provisioning queue</CardTitle></CardHeader><CardContent className="space-y-2">{jobs.map((job) => <div key={job.provisioning_job_id} className="grid gap-2 rounded-lg border p-3 md:grid-cols-[1fr_auto_auto]"><div><div className="flex flex-wrap gap-2"><strong>{job.university_asset_id}</strong><Badge variant="outline">{job.job_type}</Badge><Badge variant={job.status === "COMPLETED" ? "success" : job.status === "FAILED" ? "destructive" : "outline"}>{job.status.replaceAll("_", " ")}</Badge></div><p className="text-sm text-muted-foreground">{job.product_name} · {job.logical_rfid_code ?? "signed label only"}</p></div><span className="text-sm">{job.device_code ?? "Unclaimed"}</span><span className="text-xs text-muted-foreground">rev {job.aggregate_revision}</span></div>)}{!jobs.length && <p className="py-8 text-center text-sm text-muted-foreground">No provisioning jobs.</p>}</CardContent></Card>
      </div>}

      {view === "verify" && <Card><CardHeader><CardTitle>Independent attachment verification</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2">
        <select className="rounded-md border p-2 text-sm md:col-span-2" value={selectedJob} onChange={(event) => { const value = event.target.value; setSelectedJob(value); const job = jobs.find((item) => item.provisioning_job_id === value); setAssetCode(job?.university_asset_id ?? ""); }} aria-label="Verification job"><option value="">Select verification-pending job</option>{jobs.filter((job) => job.status === "VERIFICATION_PENDING").map((job) => <option key={job.provisioning_job_id} value={job.provisioning_job_id}>{job.university_asset_id} · {job.product_name}</option>)}</select>
        <Input placeholder="Scanned University Asset ID" value={assetCode} onChange={(event) => setAssetCode(event.target.value)} />
        <Input placeholder="Scanned QR payload SHA-256" value={qrHash} onChange={(event) => setQrHash(event.target.value)} />
        {verificationJob?.logical_rfid_code && <><Input placeholder="Physical RFID tag UID" value={tagUid} onChange={(event) => setTagUid(event.target.value)} /><Input placeholder="RFID payload SHA-256" value={rfidHash} onChange={(event) => setRfidHash(event.target.value)} /></>}
        <div className="md:col-span-2"><Button disabled={busy || !verificationJob || !assetCode || !qrHash} onClick={() => void verify()}>Verify exact physical attachment</Button></div>
      </CardContent></Card>}

      {view === "devices" && <Card><CardHeader><CardTitle>Registered hardware</CardTitle></CardHeader><CardContent className="space-y-2">{devices.map((device, index) => <div key={String(device.device_id ?? index)} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"><div><strong>{String(device.device_code ?? "Device")}</strong><p className="text-sm text-muted-foreground">{String(device.device_type ?? "—")} · firmware {String(device.firmware_version ?? "—")}</p></div><Badge variant={device.status === "ACTIVE" && device.attestation_status === "ATTESTED" ? "success" : "outline"}>{String(device.attestation_status ?? device.status ?? "PENDING")}</Badge></div>)}{!devices.length && <p className="text-sm text-muted-foreground">No registered devices. Device enrollment is available to hardware administrators through the authenticated API.</p>}</CardContent></Card>}

      {view === "gates" && <Card><CardHeader><CardTitle>Human review queue</CardTitle></CardHeader><CardContent className="space-y-2">{alerts.map((alert, index) => <div key={String(alert.gate_alert_id ?? index)} className="grid gap-2 rounded-lg border p-3 md:grid-cols-[1fr_auto]"><div><div className="flex gap-2"><strong>{String(alert.university_asset_id ?? alert.physical_tag_uid ?? "Unknown tag")}</strong><Badge variant="destructive">REVIEW REQUIRED</Badge></div><p className="text-sm text-muted-foreground">{String(alert.gate_reference ?? "Unknown gate")} · {String(alert.direction ?? "—")} · {String(alert.reason_code ?? alert.alert_type ?? "Manual verification")}</p><p className="text-xs text-muted-foreground">A missing permit is not a theft determination.</p></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => void api.actOnAlert(String(alert.gate_alert_id), "ACKNOWLEDGE").then(reload)}>Acknowledge</Button><Button size="sm" onClick={() => void api.actOnAlert(String(alert.gate_alert_id), "RESOLVE", "Human verification completed").then(reload)}>Resolve</Button></div></div>)}{!alerts.length && <p className="py-8 text-center text-sm text-muted-foreground">No gate observations require review.</p>}</CardContent></Card>}
    </div>
  );
}
