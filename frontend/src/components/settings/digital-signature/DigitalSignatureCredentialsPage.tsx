'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  AlertTriangle,
  Loader2,
  PenLine,
  ShieldCheck,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ACCEPTED_SIGNATURE_TYPES,
  MAX_SIGNATURE_BYTES,
  STATUS_META,
  type DscAlert,
  type DscStatus,
  type SignatureActivity,
} from '@/components/settings/digital-signature/digital-signature-data';
import { REGISTRAR_DESK } from '@/lib/api/api.registrar-desk';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { isCampusAdminFamilyRole } from '@/lib/campus-admin.roles';
import { toast } from '@/lib/notifications/falcon-toast';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

type ApiCertificate = {
  owner_name: string;
  certificate_name: string;
  certificate_authority?: string;
  serial_number?: string;
  valid_from?: string;
  expiry_date?: string;
  status: string;
  issued_by?: string;
  last_used_at?: string;
  signature_image_url?: string | null;
};

type ApiHistoryRow = {
  history_id: string;
  document_label: string;
  action: string;
  status: string;
  signed_by_name?: string;
  created_at: string;
};

function mapApiStatus(raw?: string): DscStatus {
  const s = (raw ?? '').toUpperCase();
  if (s === 'CONNECTED') return 'connected';
  if (s === 'EXPIRING' || s === 'RENEWAL_REQUESTED') return 'expiring';
  if (s === 'EXPIRED') return 'expired';
  return 'not_configured';
}

function fmtCertDate(v?: string | null) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return v;
  }
}

function fmtDateTime(v?: string | null) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return v;
  }
}

function mapHistory(rows: ApiHistoryRow[]): SignatureActivity[] {
  return rows.map((r) => ({
    id: r.history_id,
    date: fmtCertDate(r.created_at),
    document: r.document_label,
    signedBy: r.signed_by_name ?? 'Registrar',
    action: r.action,
    status: r.status.toUpperCase() === 'COMPLETED' ? 'Completed' : r.status.toUpperCase() === 'PENDING' ? 'Pending' : 'Failed',
  }));
}

function buildAlerts(cert: ApiCertificate | null, hasSignature: boolean): DscAlert[] {
  if (!cert) {
    return [
      {
        id: 'nc',
        tone: 'amber',
        message:
          'No official DSC is configured. Upload a signature image for attestation. Ask IT Admin (Campus Admin) to register Class-3 DSC metadata — Falcon never stores private keys.',
      },
    ];
  }
  const alerts: DscAlert[] = [];
  const status = mapApiStatus(cert.status);
  if (status === 'not_configured') {
    alerts.push({
      id: 'nc2',
      tone: 'amber',
      message:
        'DSC metadata is not configured by IT Admin. Signing will be recorded as signature-image attestation only.',
    });
  }
  if (status === 'expiring') {
    alerts.push({ id: 'exp', tone: 'amber', message: `DSC certificate expires on ${fmtCertDate(cert.expiry_date)} — renewal recommended.` });
  }
  if (status === 'expired') {
    alerts.push({ id: 'exd', tone: 'red', message: 'DSC certificate has expired. Request renewal before signing documents.' });
  }
  if (cert.status.toUpperCase() === 'RENEWAL_REQUESTED') {
    alerts.push({ id: 'ren', tone: 'blue', message: 'DSC renewal request submitted — IT will follow up.' });
  }
  if (hasSignature) {
    alerts.push({ id: 'sig', tone: 'green', message: 'Signature image is configured for document overlays.' });
  }
  return alerts.length ? alerts : [{ id: 'ok', tone: 'green', message: 'Configured DSC is ready for signing operations.' }];
}

const BRAND_BTN =
  'border border-[#0B2447] bg-[#0B2447] text-white transition-colors hover:bg-[#123A6D] hover:text-white active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy disabled:opacity-60';

const OUTLINE_BTN =
  'border border-[#0B2447] bg-white text-[#0B2447] transition-colors hover:bg-[#0B2447]/5 active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy disabled:opacity-60';

const TABLE_HEAD =
  'h-11 border-b border-sgvu-navy/10 bg-white px-4 text-left align-middle text-xs font-semibold normal-case text-sgvu-navy/70';

const CELL = 'px-4 py-3.5 align-middle text-sm text-sgvu-navy';

const ACTIVITY_PAGE_SIZE = 5;

function SectionCard({
  id,
  title,
  description,
  children,
}: {
  id?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card id={id} className="scroll-mt-24 border-sgvu-navy/10 bg-white shadow-sm">
      <CardHeader className="border-b border-sgvu-navy/10 bg-white pb-3">
        <CardTitle className="text-base font-bold text-sgvu-navy">{title}</CardTitle>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </CardHeader>
      <CardContent className="bg-white p-5 md:p-6">{children}</CardContent>
    </Card>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-sgvu-navy/10 bg-white p-3.5">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-sm font-semibold text-sgvu-navy">{value}</p>
    </div>
  );
}

function activityStatusClass(status: SignatureActivity['status']) {
  if (status === 'Completed') return 'bg-emerald-100 text-emerald-800';
  if (status === 'Pending') return 'bg-amber-100 text-amber-900';
  return 'bg-red-100 text-red-800';
}

export function DigitalSignatureCredentialsPage() {
  const api = useAuthedApi();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [certificate, setCertificate] = useState<ApiCertificate | null>(null);
  const [activity, setActivity] = useState<SignatureActivity[]>([]);
  const [signaturePreview, setSignaturePreview] = useState<string | null>(null);
  const [signatureName, setSignatureName] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [cropOffset, setCropOffset] = useState(0);
  const [activityOffset, setActivityOffset] = useState(0);
  const [savingSignature, setSavingSignature] = useState(false);

  const [signQueue, setSignQueue] = useState<'certificates' | 'appointments' | 'all'>('certificates');
  const [queueCounts, setQueueCounts] = useState({ certificates: 0, appointments: 0 });
  const [signing, setSigning] = useState(false);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);
  const [renewNotes, setRenewNotes] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
  const [configForm, setConfigForm] = useState({
    owner_user_id: '',
    owner_name: '',
    certificate_name: '',
    certificate_authority: '',
    serial_number: '',
    valid_from: '',
    expiry_date: '',
    issued_by: '',
  });

  const canConfigureDsc = useMemo(() => {
    const roles = user?.roles?.length ? user.roles : user?.role ? [user.role] : [];
    return roles.some((r) => isCampusAdminFamilyRole(r) || r === 'SuperAdmin');
  }, [user]);

  const dscStatus: DscStatus = mapApiStatus(certificate?.status);
  const statusMeta = STATUS_META[dscStatus];
  const alerts = useMemo(() => buildAlerts(certificate, !!signaturePreview), [certificate, signaturePreview]);

  const loadDsc = useCallback(async () => {
    setLoading(true);
    try {
      const [data, queue] = await Promise.all([
        api.get<{ certificate: ApiCertificate; history: ApiHistoryRow[] }>(REGISTRAR_DESK.dsc),
        api
          .get<{ totals?: { certificates?: number; appointments?: number } }>(REGISTRAR_DESK.dscSignQueue)
          .catch(() => null),
      ]);
      setCertificate(data.certificate ?? null);
      setActivity(mapHistory(Array.isArray(data.history) ? data.history : []));
      const url = data.certificate?.signature_image_url ?? null;
      setSignaturePreview(url);
      setSignatureName(url ? 'Saved signature' : null);
      setQueueCounts({
        certificates: queue?.totals?.certificates ?? 0,
        appointments: queue?.totals?.appointments ?? 0,
      });
    } catch (e) {
      toast.error('Could not load DSC profile', {
        description: e instanceof Error ? e.message : 'Request failed',
      });
      setCertificate(null);
      setActivity([]);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void loadDsc();
  }, [loadDsc]);

  const pagedActivity = useMemo(
    () => activity.slice(activityOffset, activityOffset + ACTIVITY_PAGE_SIZE),
    [activity, activityOffset],
  );

  const persistSignature = useCallback(async (dataUrl: string, name: string) => {
    setSavingSignature(true);
    try {
      await api.patch(REGISTRAR_DESK.dscSignature, { signature_image_url: dataUrl });
      setSignaturePreview(dataUrl);
      setSignatureName(name);
      toast.success('Signature saved', { description: `${name} is ready for preview and signing.` });
    } catch (e) {
      toast.error('Could not save signature', { description: e instanceof Error ? e.message : 'Error' });
    } finally {
      setSavingSignature(false);
    }
  }, [api]);

  function handleFileSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!ACCEPTED_SIGNATURE_TYPES.includes(file.type)) {
      toast.error('Invalid file type', { description: 'Upload PNG or SVG with transparent background.' });
      event.target.value = '';
      return;
    }
    if (file.size > MAX_SIGNATURE_BYTES) {
      toast.error('File too large', { description: 'Maximum signature image size is 2 MB.' });
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        void persistSignature(reader.result, file.name);
        setZoom(100);
        setCropOffset(0);
      }
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  }

  async function removeSignature() {
    setSavingSignature(true);
    try {
      await api.patch(REGISTRAR_DESK.dscSignature, { signature_image_url: null });
      setSignaturePreview(null);
      setSignatureName(null);
      setZoom(100);
      setCropOffset(0);
      toast.success('Signature removed');
    } catch (e) {
      toast.error('Could not remove signature', { description: e instanceof Error ? e.message : 'Error' });
    } finally {
      setSavingSignature(false);
    }
  }

  async function runBulkSign() {
    if (dscStatus === 'expired') {
      toast.error('DSC expired', { description: 'Request renewal before signing documents.' });
      return;
    }
    if (!signaturePreview) {
      toast.error('Signature required', {
        description: 'Upload a signature image before bulk attestation.',
      });
      return;
    }
    setSigning(true);
    try {
      const result = await api.post<{ signed_count: number; error_count: number }>(
        REGISTRAR_DESK.dscBulkSign,
        { queue: signQueue },
      );
      toast.success('Bulk attestation completed', {
        description: `Signed ${result.signed_count ?? 0} document(s)${
          result.error_count ? `; ${result.error_count} failed` : ''
        }. This is signature-image attestation, not HSM Class-3 crypto.`,
      });
      void loadDsc();
    } catch (e) {
      toast.error('Bulk sign failed', { description: e instanceof Error ? e.message : 'Error' });
    } finally {
      setSigning(false);
    }
  }

  function downloadSignedDemo() {
    window.location.assign('/admin/certificates');
  }

  async function submitDscConfigure() {
    if (!configForm.certificate_name.trim() || !configForm.serial_number.trim() || !configForm.expiry_date) {
      toast.warning('Missing DSC fields', {
        description: 'Certificate name, serial number, and expiry date are required.',
      });
      return;
    }
    setSavingConfig(true);
    try {
      await api.patch(REGISTRAR_DESK.dscConfigure, {
        owner_user_id: configForm.owner_user_id.trim() || undefined,
        owner_name: configForm.owner_name.trim() || undefined,
        certificate_name: configForm.certificate_name.trim(),
        certificate_authority: configForm.certificate_authority.trim() || undefined,
        serial_number: configForm.serial_number.trim(),
        valid_from: configForm.valid_from || undefined,
        expiry_date: configForm.expiry_date,
        issued_by: configForm.issued_by.trim() || undefined,
      });
      toast.success('DSC metadata configured', {
        description: 'Private keys are never stored. Degree signing now requires this configuration on the owner account.',
      });
      await loadDsc();
    } catch (e) {
      toast.error('DSC configure failed', {
        description: e instanceof Error ? e.message : 'Request failed',
      });
    } finally {
      setSavingConfig(false);
    }
  }

  async function submitRenewal() {
    if (!renewNotes.trim()) {
      toast.warning('Add renewal details', { description: 'Briefly describe your DSC renewal request.' });
      return;
    }
    try {
      await api.post(REGISTRAR_DESK.dscRenew, { notes: renewNotes.trim() });
      setRenewOpen(false);
      setRenewNotes('');
      toast.success('Renewal request sent', { description: 'IT will contact you to schedule certificate replacement.' });
      void loadDsc();
    } catch (e) {
      toast.error('Renewal request failed', { description: e instanceof Error ? e.message : 'Error' });
    }
  }

  function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        Loading digital signature workspace…
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 md:px-6" data-testid="digital-signature-credentials">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <Link
            href="/admin/account/settings"
            className="text-xs font-semibold text-sgvu-gold hover:underline"
          >
            ← Account Settings
          </Link>
          <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.22em] text-sgvu-gold">Registrar Portal</p>
          <h1 className="text-2xl font-bold text-sgvu-navy sm:text-3xl">Digital Signature &amp; Credentials</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Manage your official university digital signature and signing credentials.
          </p>
        </CardContent>
      </Card>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardHeader className="border-b border-sgvu-navy/10 pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-bold text-sgvu-navy">
            <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />
            Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-sgvu-navy/5 bg-white p-0">
          {alerts.map((alert) => (
            <div key={alert.id} className="flex items-start gap-3 bg-white px-4 py-3 text-sm">
              <span
                className={cn(
                  'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                  alert.tone === 'amber' && 'bg-amber-500',
                  alert.tone === 'red' && 'bg-red-500',
                  alert.tone === 'green' && 'bg-emerald-500',
                  alert.tone === 'blue' && 'bg-blue-500',
                )}
                aria-hidden
              />
              <p className="text-sgvu-navy/90">{alert.message}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="rounded-2xl border border-sgvu-navy/10 bg-white p-4 shadow-sm">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-sgvu-gold">Quick actions</p>
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Upload Signature', action: () => fileInputRef.current?.click() },
            { label: 'Preview Signature', action: () => setPreviewOpen(true) },
            { label: 'Digitally Sign Documents', action: () => scrollToSection('bulk-signing') },
            { label: 'View Signing History', action: () => scrollToSection('signing-history') },
            { label: 'Request DSC Renewal', action: () => setRenewOpen(true) },
          ].map((item) => (
            <button key={item.label} type="button" className={cn('h-10 rounded-lg px-4 text-sm font-semibold', BRAND_BTN)} onClick={item.action}>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <SectionCard title="Digital Signature Status" description="Current DSC connection and certificate validity.">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <Badge variant="outline" className={cn('gap-2 border-transparent px-3 py-1 text-sm font-semibold', statusMeta.badge)}>
            <span className={cn('h-2.5 w-2.5 rounded-full', statusMeta.dot)} aria-hidden />
            DSC Status — {statusMeta.label}
          </Badge>
          <p className="text-sm text-muted-foreground">{statusMeta.description}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <DetailField label="Certificate owner" value={certificate?.owner_name ?? '—'} />
          <DetailField label="Valid from" value={fmtCertDate(certificate?.valid_from)} />
          <DetailField label="Certificate expiry" value={fmtCertDate(certificate?.expiry_date)} />
          <DetailField label="Issued by" value={certificate?.issued_by ?? '—'} />
          <DetailField label="Last used" value={fmtDateTime(certificate?.last_used_at)} />
          <DetailField label="Certificate name" value={certificate?.certificate_name ?? '—'} />
          <DetailField label="Serial number" value={certificate?.serial_number ?? '—'} />
          <DetailField label="Certificate authority" value={certificate?.certificate_authority ?? '—'} />
        </div>
      </SectionCard>

      {canConfigureDsc ? (
        <SectionCard
          id="configure-dsc"
          title="IT Admin — Configure DSC metadata"
          description="Register Class-3 certificate metadata for a Registrar account. Falcon never stores private keys or HSM tokens; this enables configured-DSC attestation and degree signing gates."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1 sm:col-span-2">
              <span className="text-xs text-muted-foreground">Owner user ID (Registrar). Leave blank to use current admin user.</span>
              <Input
                value={configForm.owner_user_id}
                onChange={(e) => setConfigForm((f) => ({ ...f, owner_user_id: e.target.value }))}
                placeholder={user?.user_id ?? 'Registrar UUID'}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">Owner display name</span>
              <Input
                value={configForm.owner_name}
                onChange={(e) => setConfigForm((f) => ({ ...f, owner_name: e.target.value }))}
                placeholder="University Registrar"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">Certificate name</span>
              <Input
                value={configForm.certificate_name}
                onChange={(e) => setConfigForm((f) => ({ ...f, certificate_name: e.target.value }))}
                placeholder="Class-3 Signing Certificate"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">Certificate authority</span>
              <Input
                value={configForm.certificate_authority}
                onChange={(e) => setConfigForm((f) => ({ ...f, certificate_authority: e.target.value }))}
                placeholder="e.g. eMudhra / Capricorn"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">Serial number</span>
              <Input
                value={configForm.serial_number}
                onChange={(e) => setConfigForm((f) => ({ ...f, serial_number: e.target.value }))}
                placeholder="DSC serial"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">Valid from</span>
              <Input
                type="date"
                value={configForm.valid_from}
                onChange={(e) => setConfigForm((f) => ({ ...f, valid_from: e.target.value }))}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">Expiry date</span>
              <Input
                type="date"
                value={configForm.expiry_date}
                onChange={(e) => setConfigForm((f) => ({ ...f, expiry_date: e.target.value }))}
              />
            </label>
            <label className="block space-y-1 sm:col-span-2">
              <span className="text-xs text-muted-foreground">Issued by</span>
              <Input
                value={configForm.issued_by}
                onChange={(e) => setConfigForm((f) => ({ ...f, issued_by: e.target.value }))}
                placeholder="Issuing CA / IT asset tag"
              />
            </label>
          </div>
          <div className="mt-4">
            <Button
              type="button"
              className={cn(BRAND_BTN)}
              disabled={savingConfig}
              onClick={() => void submitDscConfigure()}
            >
              {savingConfig ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
              Save DSC configuration
            </Button>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard
        id="upload-signature"
        title="Upload Signature Image"
        description="Official signature image for document overlays. PNG or SVG, max 2 MB. Private keys are never stored here."
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".png,.svg,image/png,image/svg+xml"
          className="sr-only"
          onChange={handleFileSelect}
        />
        <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
          <div className="space-y-4">
            <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-dashed border-sgvu-navy/20 bg-white p-6">
              {signaturePreview ? (
                <div className="overflow-hidden rounded-xl border border-sgvu-navy/10 bg-white p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={signaturePreview}
                    alt="Uploaded signature preview"
                    className="max-h-40 max-w-full object-contain transition-transform duration-200"
                    style={{
                      transform: `scale(${zoom / 100}) translateY(${cropOffset}px)`,
                    }}
                  />
                </div>
              ) : (
                <div className="text-center">
                  <PenLine className="mx-auto h-10 w-10 text-sgvu-gold/80" aria-hidden />
                  <p className="mt-2 text-sm font-medium text-sgvu-navy">No signature uploaded</p>
                  <p className="text-xs text-muted-foreground">PNG or SVG · transparent background preferred</p>
                </div>
              )}
            </div>
            {signaturePreview ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">Zoom</span>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => setZoom((z) => Math.max(50, z - 10))}>
                      <ZoomOut className="h-4 w-4" aria-hidden />
                    </Button>
                    <span className="min-w-[3rem] text-center text-sm font-semibold tabular-nums">{zoom}%</span>
                    <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => setZoom((z) => Math.min(200, z + 10))}>
                      <ZoomIn className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">Crop (vertical adjust)</span>
                  <input
                    type="range"
                    min={-40}
                    max={40}
                    value={cropOffset}
                    onChange={(e) => setCropOffset(Number(e.target.value))}
                    className="w-full accent-[#1d67d5]"
                  />
                </label>
              </div>
            ) : null}
          </div>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {signatureName ? `File: ${signatureName}` : 'Accepted: PNG, SVG · Max 2 MB'}
            </p>
            <button type="button" className={cn('inline-flex h-10 w-full items-center justify-center rounded-lg text-sm font-semibold', BRAND_BTN)} onClick={() => fileInputRef.current?.click()} disabled={savingSignature}>
              {signaturePreview ? 'Replace' : 'Upload'}
            </button>
            <button type="button" className={cn('inline-flex h-10 w-full items-center justify-center rounded-lg text-sm font-semibold', OUTLINE_BTN)} onClick={() => setPreviewOpen(true)} disabled={!signaturePreview}>
              Preview
            </button>
            <button type="button" className={cn('inline-flex h-10 w-full items-center justify-center rounded-lg text-sm font-semibold', OUTLINE_BTN)} onClick={() => void removeSignature()} disabled={!signaturePreview || savingSignature}>
              Remove
            </button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Digital Certificate" description="Read-only certificate metadata. Private keys are managed by IT on secure hardware.">
        <div className="mb-4 rounded-xl border border-amber-200/80 bg-white p-3 text-sm text-amber-900">
          <ShieldCheck className="mr-1.5 inline h-4 w-4" aria-hidden />
          Certificate administration is restricted to System Admin / IT. Registrars cannot edit or export private keys.
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <DetailField label="Certificate name" value={certificate?.certificate_name ?? '—'} />
          <DetailField label="Certificate authority" value={certificate?.certificate_authority ?? '—'} />
          <DetailField label="Serial number" value={certificate?.serial_number ?? '—'} />
          <DetailField label="Expiry date" value={fmtCertDate(certificate?.expiry_date)} />
          <DetailField label="Current status" value={statusMeta.label} />
        </div>
      </SectionCard>

      <SectionCard
        id="bulk-signing"
        title="Bulk Document Attestation"
        description="Sign live queues of generated certificates and approved appointment letters. Falcon records signature-image attestation (not HSM/Class-3 crypto)."
      >
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-sgvu-navy/10 bg-white p-3.5">
            <p className="text-[11px] font-medium text-muted-foreground">Certificates ready</p>
            <p className="mt-1 text-2xl font-bold text-sgvu-navy">{queueCounts.certificates}</p>
          </div>
          <div className="rounded-xl border border-sgvu-navy/10 bg-white p-3.5">
            <p className="text-[11px] font-medium text-muted-foreground">Appointment letters ready</p>
            <p className="mt-1 text-2xl font-bold text-sgvu-navy">{queueCounts.appointments}</p>
          </div>
          <label className="block space-y-1 rounded-xl border border-sgvu-navy/10 bg-white p-3.5">
            <span className="text-[11px] font-medium text-muted-foreground">Queue</span>
            <Select
              value={signQueue}
              onChange={(e) => setSignQueue(e.target.value as 'certificates' | 'appointments' | 'all')}
              className="mt-1 h-10"
            >
              <option value="certificates">Certificates ({queueCounts.certificates})</option>
              <option value="appointments">Appointments ({queueCounts.appointments})</option>
              <option value="all">All ready documents</option>
            </Select>
          </label>
        </div>
        <div className="mt-5 flex flex-wrap gap-2 border-t border-sgvu-navy/10 pt-5">
          <button type="button" className={cn('h-10 rounded-lg px-4 text-sm font-semibold', OUTLINE_BTN)} onClick={() => setPreviewOpen(true)}>
            Preview signature
          </button>
          <button type="button" className={cn('h-10 rounded-lg px-4 text-sm font-semibold', BRAND_BTN)} disabled={signing} onClick={() => void runBulkSign()}>
            {signing ? 'Attesting…' : 'Attest queue'}
          </button>
          <button type="button" className={cn('h-10 rounded-lg px-4 text-sm font-semibold', OUTLINE_BTN)} onClick={downloadSignedDemo}>
            Open Certificate Desk
          </button>
        </div>
      </SectionCard>

      <SectionCard id="signing-history" title="Recent Signature Activity" description="Audit trail of signing actions.">
        {pagedActivity.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">No signing activity yet.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table className="min-w-[720px]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={TABLE_HEAD}>Date</TableHead>
                    <TableHead className={TABLE_HEAD}>Document</TableHead>
                    <TableHead className={TABLE_HEAD}>Signed by</TableHead>
                    <TableHead className={TABLE_HEAD}>Action</TableHead>
                    <TableHead className={TABLE_HEAD}>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedActivity.map((row) => (
                    <TableRow key={row.id} className="border-sgvu-navy/5 bg-white hover:bg-white">
                      <TableCell className={CELL}>{row.date}</TableCell>
                      <TableCell className={cn(CELL, 'font-medium')}>{row.document}</TableCell>
                      <TableCell className={CELL}>{row.signedBy}</TableCell>
                      <TableCell className={CELL}>{row.action}</TableCell>
                      <TableCell className={CELL}>
                        <Badge variant="outline" className={cn('border-transparent text-[11px] font-semibold', activityStatusClass(row.status))}>
                          {row.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="border-t border-sgvu-navy/10 px-1 py-4">
              <PaginationBar total={activity.length} limit={ACTIVITY_PAGE_SIZE} offset={activityOffset} onPageChange={setActivityOffset} />
            </div>
          </>
        )}
      </SectionCard>

      <SectionCard title="Security" description="Session and signing security snapshot.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <DetailField label="Last signature" value={fmtDateTime(certificate?.last_used_at)} />
          <DetailField label="Certificate status" value={statusMeta.label} />
          <DetailField label="Signature image" value={signaturePreview ? 'Configured' : 'Not uploaded'} />
        </div>
      </SectionCard>

      <SectionCard title="Permissions" description="Role-based access for signing and certificate administration.">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-sgvu-navy/10 bg-white p-4">
            <p className="text-sm font-bold text-sgvu-navy">Registrar</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-muted-foreground">
              <li>Upload signature image</li>
              <li>Digitally sign approved documents</li>
              <li>View signing history</li>
              <li>Request DSC renewal</li>
            </ul>
          </div>
          <div className="rounded-xl border border-sgvu-navy/10 bg-white p-4">
            <p className="text-sm font-bold text-sgvu-navy">System Admin / IT</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-muted-foreground">
              <li>Configure DSC USB token</li>
              <li>Install and manage certificates</li>
              <li>Certificate lifecycle & replacement</li>
              <li>No plain-text password storage</li>
            </ul>
          </div>
        </div>
      </SectionCard>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sgvu-navy">Signature preview</DialogTitle>
            <DialogDescription>How your signature appears on official documents.</DialogDescription>
          </DialogHeader>
          <div className="flex min-h-[180px] items-center justify-center rounded-xl border border-sgvu-navy/10 bg-white p-6">
            {signaturePreview ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={signaturePreview} alt="Signature preview" className="max-h-32 max-w-full object-contain" style={{ transform: `scale(${zoom / 100})` }} />
            ) : (
              <p className="text-sm text-muted-foreground">Upload a signature image to preview.</p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPreviewOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renewOpen} onOpenChange={setRenewOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sgvu-navy">Request DSC renewal</DialogTitle>
            <DialogDescription>IT will schedule token verification and certificate replacement.</DialogDescription>
          </DialogHeader>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Notes for IT</span>
            <textarea
              value={renewNotes}
              onChange={(e) => setRenewNotes(e.target.value)}
              rows={4}
              className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm"
              placeholder="Certificate expiring on 14 Aug 2026. Request replacement before bulk degree signing."
            />
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRenewOpen(false)}>
              Cancel
            </Button>
            <Button type="button" className={BRAND_BTN} onClick={() => void submitRenewal()}>
              Submit request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
