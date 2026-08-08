'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Download,
  FileCheck2,
  FileText,
  Loader2,
  Receipt,
  Wallet,
} from 'lucide-react';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentSectionCard } from '@/components/student/StudentSectionCard';
import { StudentInfoTile } from '@/components/student/StudentInfoTile';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';
import { StudentLoadingState } from '@/components/student/StudentLoadingState';
import { OnboardingDocDropzone } from '@/components/student/OnboardingDocDropzone';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { useAuthedApi } from '@/lib/api';
import { withAccessToken } from '@/lib/authenticated-download-url';
import {
  buildDemoAdmissionVault,
  DEMO_FEE_RECEIPT_DOCS,
  DEMO_STUDENT,
} from '@/lib/mock/student-portal-demo';
import { isStudentDemoModeEnabled } from '@/lib/student-demo-mode';
import {
  buildVaultPdfBlob,
  downloadVaultPdf,
} from '@/lib/student/vault-pdf';
import { toast } from '@/lib/notifications/falcon-toast';
import { cn } from '@/lib/utils';

type Vault = {
  profile: Record<string, unknown> | null;
  application: Record<string, unknown> | null;
  entrance_exams: Record<string, unknown>[];
  counseling_rounds: Record<string, unknown>[];
  documents: Record<string, unknown>[];
  admission_fee_receipts: Record<string, unknown>[];
  timeline: { label: string; date: string }[];
};

type FeeDoc = {
  title: string;
  file_url: string;
  created_at: string;
  category?: string;
};

type PreviewItem = {
  kind: 'document' | 'receipt';
  id: string;
  title: string;
  status: string;
  subtitle?: string;
  meta: Array<{ label: string; value: string }>;
  downloadHref?: string | null;
  mimeHint?: 'pdf' | 'image' | 'unknown';
  isDemo?: boolean;
};

function guessMimeHint(pathOrUrl: string | null | undefined): PreviewItem['mimeHint'] {
  if (!pathOrUrl) return 'unknown';
  const lower = pathOrUrl.toLowerCase().split('?')[0] ?? '';
  if (/\.(png|jpe?g|gif|webp)$/i.test(lower)) return 'image';
  if (/\.pdf$/i.test(lower)) return 'pdf';
  return 'pdf';
}

function triggerBrowserDownload(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

const DOC_TITLE_OPTIONS = [
  '10th Marksheet',
  '12th Marksheet',
  'Transfer Certificate',
  'Migration Certificate',
  'Character Certificate',
  'Aadhaar Card',
  'Caste Certificate',
  'Income Certificate',
  'Other',
] as const;

function isVaultSparse(vault: Vault | null): boolean {
  if (!vault) return true;
  const hasProfile =
    Boolean(vault.profile?.admission_type) ||
    Boolean(vault.profile?.admission_number) ||
    Boolean(vault.application?.application_no);
  const hasContent =
    (vault.documents?.length ?? 0) > 0 ||
    (vault.admission_fee_receipts?.length ?? 0) > 0;
  return !hasProfile && !hasContent;
}

function mergeVaultWithDemo(live: Vault | null): Vault {
  const demo = buildDemoAdmissionVault();
  if (!isStudentDemoModeEnabled()) {
    return (
      live ?? {
        profile: null,
        application: null,
        entrance_exams: [],
        counseling_rounds: [],
        documents: [],
        admission_fee_receipts: [],
        timeline: [],
      }
    );
  }
  if (!live || isVaultSparse(live)) return demo;

  const liveDocs = (live.documents ?? []).filter(
    (d) => !String(d.title ?? '').toUpperCase().startsWith('SMOKE:'),
  );

  return {
    profile: {
      ...demo.profile,
      ...(live.profile ?? {}),
      admission_type:
        live.profile?.admission_type ??
        live.application?.admission_type ??
        demo.profile.admission_type,
      admission_number:
        live.profile?.admission_number ??
        live.application?.application_no ??
        demo.profile.admission_number,
      migration_certificate_status:
        live.profile?.migration_certificate_status ??
        demo.profile.migration_certificate_status,
    },
    application: live.application ?? demo.application,
    entrance_exams:
      (live.entrance_exams?.length ?? 0) > 0
        ? live.entrance_exams
        : demo.entrance_exams,
    counseling_rounds:
      (live.counseling_rounds?.length ?? 0) > 0
        ? live.counseling_rounds
        : demo.counseling_rounds,
    documents: liveDocs.length > 0 ? liveDocs : demo.documents,
    admission_fee_receipts:
      (live.admission_fee_receipts?.length ?? 0) > 0
        ? live.admission_fee_receipts
        : demo.admission_fee_receipts,
    timeline:
      (live.timeline?.length ?? 0) > 0 ? live.timeline : demo.timeline,
  };
}

function formatMoney(amount: unknown): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  return `₹${n.toLocaleString('en-IN')}`;
}

function formatDate(value: unknown): string {
  if (!value) return '—';
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-IN', { dateStyle: 'medium' });
}

function statusVariant(
  status: string,
): 'success' | 'warning' | 'outline' | 'secondary' {
  const s = status.toUpperCase();
  if (s === 'VERIFIED' || s === 'PAID' || s === 'AVAILABLE') return 'success';
  if (s === 'PENDING' || s === 'PARTIAL') return 'warning';
  if (s === 'ON FILE') return 'secondary';
  return 'outline';
}

const vaultActionBtn =
  'border-sgvu-navy/20 bg-sgvu-navy text-white shadow-none hover:bg-[#123A6D] hover:text-white active:bg-sgvu-gold active:text-sgvu-navy active:border-sgvu-gold';

const vaultActionBtnActive =
  'bg-sgvu-gold text-sgvu-navy border-sgvu-gold hover:bg-sgvu-gold-hover hover:text-sgvu-navy';

function VaultTable({
  items,
  columns,
  onView,
  activeViewId,
}: {
  items: PreviewItem[];
  columns: { key: 'title' | 'subtitle' | 'status'; label: string; className?: string }[];
  onView: (item: PreviewItem) => void;
  activeViewId?: string | null;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/70">
      <div
        className={cn(
          'hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_7.5rem_6rem] gap-3 border-b border-border/70 bg-slate-50/90 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid',
        )}
      >
        {columns.map((col) => (
          <span key={col.key} className={col.className}>
            {col.label}
          </span>
        ))}
        <span className="text-right">Actions</span>
      </div>
      <ul className="divide-y divide-border/60">
        {items.map((item) => {
          const viewing = activeViewId === item.id;
          return (
            <li
              key={item.id}
              className={cn(
                'grid grid-cols-1 gap-2 px-4 py-3.5 transition hover:bg-sgvu-gold/5',
                'sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_7.5rem_6rem] sm:items-center sm:gap-3',
              )}
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-sgvu-navy">{item.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground sm:hidden">
                  {item.subtitle ?? '—'}
                </p>
              </div>
              <p className="hidden min-w-0 truncate text-sm text-muted-foreground sm:block">
                {item.subtitle ?? '—'}
              </p>
              <div className="sm:justify-self-start">
                <Badge variant={statusVariant(item.status)}>{item.status}</Badge>
              </div>
              <div className="flex items-center justify-start sm:justify-end">
                <Button
                  type="button"
                  size="sm"
                  className={cn(
                    'h-8 px-3',
                    vaultActionBtn,
                    viewing && vaultActionBtnActive,
                  )}
                  onClick={() => onView(item)}
                >
                  View
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function StudentAdmissionVaultPage() {
  const api = useAuthedApi();
  const { user, token } = useAuth();
  const [data, setData] = useState<Vault | null>(null);
  const [feeDocs, setFeeDocs] = useState<FeeDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<PreviewItem | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadTitle, setUploadTitle] =
    useState<(typeof DOC_TITLE_OPTIONS)[number]>('10th Marksheet');
  const [uploadCustomTitle, setUploadCustomTitle] = useState('');
  const [uploadIssuer, setUploadIssuer] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const loadVault = useCallback(
    async (opts?: { showLoader?: boolean }) => {
      if (opts?.showLoader !== false) setLoading(true);
      try {
        const [vaultRes, docsRes] = await Promise.allSettled([
          api.get<Vault>('/api/student/admission-vault'),
          api.get<{ documents: FeeDoc[] }>('/api/student/documents'),
        ]);

        const liveVault =
          vaultRes.status === 'fulfilled' ? vaultRes.value : null;
        setData(mergeVaultWithDemo(liveVault));

        const liveFeeDocs =
          docsRes.status === 'fulfilled'
            ? (docsRes.value.documents ?? []).filter(
                (d) => d.category === 'FEE_RECEIPTS',
              )
            : [];
        setFeeDocs(
          liveFeeDocs.length > 0
            ? liveFeeDocs
            : isStudentDemoModeEnabled()
              ? DEMO_FEE_RECEIPT_DOCS.map((d) => ({ ...d }))
              : [],
        );
      } catch {
        if (isStudentDemoModeEnabled()) {
          setData(buildDemoAdmissionVault());
          setFeeDocs(DEMO_FEE_RECEIPT_DOCS.map((d) => ({ ...d })));
        } else {
          setData(null);
          setFeeDocs([]);
        }
      } finally {
        setLoading(false);
      }
    },
    [api],
  );

  useEffect(() => {
    void loadVault({ showLoader: true });
  }, [loadVault]);

  const documentItems = useMemo<PreviewItem[]>(() => {
    return (data?.documents ?? []).map((doc, i) => {
      const status = String(doc.verification_status ?? 'PENDING');
      const filePath = doc.file_path ? String(doc.file_path) : null;
      return {
        kind: 'document' as const,
        id: String(doc.certificate_id ?? `doc-${i}`),
        title: String(doc.title ?? 'Document'),
        status,
        subtitle: doc.issuer ? String(doc.issuer) : '—',
        meta: [
          { label: 'Status', value: status },
          { label: 'Issuer', value: String(doc.issuer ?? '—') },
          { label: 'Uploaded', value: formatDate(doc.uploaded_at) },
        ],
        downloadHref: filePath
          ? `/api/uploads/download?path=${encodeURIComponent(filePath)}`
          : null,
        mimeHint: guessMimeHint(filePath),
        isDemo: !filePath,
      };
    });
  }, [data?.documents]);

  const receiptItems = useMemo<PreviewItem[]>(() => {
    const fromVault = feeDocs.map((doc, i) => ({
      kind: 'receipt' as const,
      id: `fee-doc-${i}-${doc.title}`,
      title: doc.title,
      status: doc.file_url && doc.file_url !== '#' ? 'AVAILABLE' : 'ON FILE',
      subtitle: formatDate(doc.created_at),
      meta: [
        { label: 'Type', value: 'Fee receipt' },
        { label: 'Date', value: formatDate(doc.created_at) },
        {
          label: 'Status',
          value:
            doc.file_url && doc.file_url !== '#'
              ? 'Ready to download'
              : 'Archived on file',
        },
      ],
      downloadHref: doc.file_url && doc.file_url !== '#' ? doc.file_url : null,
      mimeHint: guessMimeHint(doc.file_url),
      isDemo: !doc.file_url || doc.file_url === '#',
    }));

    const titleKeys = fromVault.map((r) => r.title.toLowerCase());
    const fromPayments = (data?.admission_fee_receipts ?? [])
      .map((r, i) => {
        const feeHead = String(r.fee_head ?? 'Fee payment');
        const receiptNo = r.receipt_no ? String(r.receipt_no) : '';
        const alreadyListed = titleKeys.some(
          (t) =>
            t.includes(feeHead.toLowerCase()) ||
            (receiptNo && t.includes(receiptNo.toLowerCase())),
        );
        if (alreadyListed) return null;

        const status = String(r.status ?? 'PAID');
        const href =
          r.receipt_url && String(r.receipt_url) !== '#'
            ? String(r.receipt_url)
            : null;
        return {
          kind: 'receipt' as const,
          id: String(r.demand_id ?? `pay-${i}`),
          title: feeHead,
          status,
          subtitle: `${formatMoney(r.paid_amount ?? r.total_amount)}${
            receiptNo ? ` · ${receiptNo}` : ''
          }`,
          meta: [
            {
              label: 'Amount paid',
              value: formatMoney(r.paid_amount ?? r.total_amount),
            },
            { label: 'Receipt no.', value: receiptNo || '—' },
            { label: 'Status', value: status },
            { label: 'Due / paid date', value: formatDate(r.due_date) },
          ],
          downloadHref: href,
          mimeHint: guessMimeHint(href),
          isDemo: !href,
        };
      })
      .filter(Boolean) as PreviewItem[];

    return [...fromVault, ...fromPayments];
  }, [feeDocs, data?.admission_fee_receipts]);

  const vaultPdfPayload = useCallback(
    (item: PreviewItem) => ({
      kind: item.kind,
      title: item.title,
      status: item.status,
      fields: item.meta,
      student: {
        name: user?.name || DEMO_STUDENT.name,
        enrollmentNo: DEMO_STUDENT.enrollment_no,
        admissionNo: String(
          data?.profile?.admission_number ??
            data?.application?.application_no ??
            DEMO_STUDENT.student_id,
        ),
        program: DEMO_STUDENT.program,
      },
    }),
    [user?.name, data?.profile?.admission_number, data?.application?.application_no],
  );

  const resolveFileUrl = useCallback(
    (item: PreviewItem) => {
      if (!item.downloadHref) return null;
      return withAccessToken(item.downloadHref, token);
    },
    [token],
  );

  const openPreview = useCallback(
    async (item: PreviewItem) => {
      setPreview(item);
      setPreviewLoading(true);
      setPreviewUrl((prev) => {
        if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
        return null;
      });

      try {
        const fileUrl = resolveFileUrl(item);
        if (fileUrl) {
          setPreviewUrl(fileUrl);
          return;
        }

        // Demo / archived rows — show a generated PDF copy in the viewer.
        const { blob } = await buildVaultPdfBlob(vaultPdfPayload(item));
        setPreviewUrl(URL.createObjectURL(blob));
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : 'Could not open document preview',
        );
        setPreview(null);
      } finally {
        setPreviewLoading(false);
      }
    },
    [resolveFileUrl, vaultPdfPayload],
  );

  const closePreview = useCallback(() => {
    setPreview(null);
    setPreviewUrl((prev) => {
      if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
      return null;
    });
    setPreviewLoading(false);
  }, []);

  const handleDownload = useCallback(
    async (item: PreviewItem) => {
      if (downloadingId) return;
      setDownloadingId(item.id);
      try {
        const fileUrl = resolveFileUrl(item);
        if (fileUrl) {
          triggerBrowserDownload(
            fileUrl,
            `${item.title.replace(/[^\w\- ]+/g, '').trim() || 'document'}.pdf`,
          );
          toast.success(
            `${item.kind === 'receipt' ? 'Receipt' : 'Document'} download started`,
          );
          return;
        }

        await downloadVaultPdf(vaultPdfPayload(item));
        toast.success(
          `${item.kind === 'receipt' ? 'Receipt' : 'Document'} PDF downloaded`,
        );
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : 'Could not download document',
        );
      } finally {
        setDownloadingId(null);
      }
    },
    [downloadingId, resolveFileUrl, vaultPdfPayload],
  );

  const resetUploadForm = () => {
    setUploadTitle('10th Marksheet');
    setUploadCustomTitle('');
    setUploadIssuer('');
    setUploadFile(null);
  };

  const handleUpload = async () => {
    const title =
      uploadTitle === 'Other'
        ? uploadCustomTitle.trim()
        : uploadTitle;
    if (!title) {
      toast.error('Select or enter a document title');
      return;
    }
    if (!uploadFile) {
      toast.error('Choose a PDF, JPG, or PNG file');
      return;
    }
    if (uploadFile.size > 5 * 1024 * 1024) {
      toast.error('File must be 5 MB or smaller');
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.append('title', title);
      if (uploadIssuer.trim()) form.append('issuer', uploadIssuer.trim());
      form.append('file', uploadFile);

      const res = await api.post<{
        certificate?: Record<string, unknown>;
        message?: string;
      }>('/api/student/admission-documents', form);

      const cert = res.certificate;
      if (cert) {
        setData((prev) => {
          const base = prev ?? buildDemoAdmissionVault();
          return {
            ...base,
            documents: [cert, ...(base.documents ?? [])],
          };
        });
      } else {
        await loadVault({ showLoader: false });
      }

      toast.success(res.message ?? 'Document uploaded — pending verification');
      setUploadOpen(false);
      resetUploadForm();
    } catch (e) {
      if (isStudentDemoModeEnabled()) {
        const demoCert = {
          certificate_id: `demo-upload-${Date.now()}`,
          title,
          issuer: uploadIssuer.trim() || 'Student upload',
          verification_status: 'PENDING',
          file_path: null,
          uploaded_at: new Date().toISOString(),
        };
        setData((prev) => {
          const base = prev ?? buildDemoAdmissionVault();
          return {
            ...base,
            documents: [demoCert, ...(base.documents ?? [])],
          };
        });
        toast.success('Document added (demo) — pending verification');
        setUploadOpen(false);
        resetUploadForm();
      } else {
        toast.error(
          e instanceof Error ? e.message : 'Could not upload document',
        );
      }
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return <StudentLoadingState label="Loading your document vault…" />;
  }

  return (
    <StudentPageShell width="5xl">
      <StudentPageHeader
        title="My Documents"
        description="View admission documents and fee receipts, or download a copy anytime."
      />

      {!data ? (
        <StudentEmptyState
          title="Vault unavailable"
          description="Could not load your documents. Confirm the backend is running, then refresh."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StudentInfoTile
              label="Admission type"
              value={
                data.profile?.admission_type ??
                data.application?.admission_type ??
                '—'
              }
              icon={FileText}
            />
            <StudentInfoTile
              label="Admission number"
              value={
                data.profile?.admission_number ??
                data.application?.application_no ??
                '—'
              }
              icon={FileCheck2}
            />
            <StudentInfoTile
              label="Migration certificate"
              value={data.profile?.migration_certificate_status ?? 'PENDING'}
              icon={Receipt}
            />
          </div>

          <StudentSectionCard
            title="Admission documents"
            description="Upload certificates for verification, or open a row for details"
            icon={FileCheck2}
            action={
              <Button
                size="sm"
                className={cn(
                  vaultActionBtn,
                  uploadOpen && vaultActionBtnActive,
                )}
                onClick={() => setUploadOpen(true)}
              >
                Upload
              </Button>
            }
          >
            {documentItems.length === 0 ? (
              <StudentEmptyState
                icon={FileText}
                title="No admission documents"
                description="Upload your certificates here — they stay pending until verified."
                action={
                  <Button
                    className={vaultActionBtn}
                    onClick={() => setUploadOpen(true)}
                  >
                    Upload document
                  </Button>
                }
              />
            ) : (
              <VaultTable
                items={documentItems}
                columns={[
                  { key: 'title', label: 'Document' },
                  { key: 'subtitle', label: 'Issuer' },
                  { key: 'status', label: 'Status' },
                ]}
                onView={(item) => void openPreview(item)}
                activeViewId={preview?.id}
              />
            )}
          </StudentSectionCard>

          <StudentSectionCard
            title="Fee payment receipts"
            description="Auto-archived to your Document Vault when you pay via Finance"
            icon={Receipt}
          >
            {receiptItems.length === 0 ? (
              <StudentEmptyState
                icon={Wallet}
                title="No fee receipts yet"
                description="Pay fees from Finance — receipts show up here automatically."
                action={
                  <Button asChild className="bg-sgvu-navy hover:bg-[#123A6D]">
                    <Link href="/student/finance">Go to Pay Fees</Link>
                  </Button>
                }
              />
            ) : (
              <VaultTable
                items={receiptItems}
                columns={[
                  { key: 'title', label: 'Receipt' },
                  { key: 'subtitle', label: 'Details' },
                  { key: 'status', label: 'Status' },
                ]}
                onView={(item) => void openPreview(item)}
                activeViewId={preview?.id}
              />
            )}
          </StudentSectionCard>
        </>
      )}

      <Dialog
        open={!!preview}
        onOpenChange={(open) => {
          if (!open) closePreview();
        }}
      >
        <DialogContent className="flex max-h-[min(92dvh,90vh)] w-[calc(100%-1.25rem)] max-w-3xl flex-col gap-4 overflow-hidden p-4 sm:p-6">
          {preview ? (
            <>
              <DialogHeader>
                <DialogTitle className="pr-6">{preview.title}</DialogTitle>
                <DialogDescription>
                  {preview.kind === 'receipt'
                    ? 'Fee payment receipt'
                    : 'Admission document'}
                  {preview.isDemo ? ' · system copy' : ''}
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={statusVariant(preview.status)}>
                  {preview.status}
                </Badge>
                {preview.meta.slice(0, 2).map((row) => (
                  <span
                    key={row.label}
                    className="text-xs text-muted-foreground"
                  >
                    {row.label}:{' '}
                    <span className="font-medium text-sgvu-navy">
                      {row.value}
                    </span>
                  </span>
                ))}
              </div>

              <div className="min-h-[320px] flex-1 overflow-hidden rounded-xl border border-sgvu-navy/10 bg-slate-50">
                {previewLoading ? (
                  <div className="flex h-[420px] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin text-sgvu-navy" />
                    Opening document…
                  </div>
                ) : previewUrl ? (
                  preview.mimeHint === 'image' && !previewUrl.startsWith('blob:') ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={previewUrl}
                      alt={preview.title}
                      className="mx-auto max-h-[60vh] w-full object-contain p-3"
                    />
                  ) : (
                    <iframe
                      title={preview.title}
                      src={previewUrl}
                      className="h-[60vh] w-full bg-white"
                    />
                  )
                ) : (
                  <div className="flex h-[320px] flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
                    <FileText className="h-8 w-8 text-sgvu-navy/40" />
                    Preview unavailable. Use download to get a PDF copy.
                  </div>
                )}
              </div>

              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                Keep a copy for scholarship, bank, or verification requests.
              </p>

              <DialogFooter className="gap-2 sm:gap-2">
                <Button variant="outline" onClick={closePreview}>
                  Close
                </Button>
                <Button
                  className="bg-sgvu-navy hover:bg-[#123A6D]"
                  disabled={downloadingId === preview.id}
                  onClick={() => void handleDownload(preview)}
                >
                  {downloadingId === preview.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Download
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={uploadOpen}
        onOpenChange={(open) => {
          setUploadOpen(open);
          if (!open) resetUploadForm();
        }}
      >
        <DialogContent className="max-w-lg gap-0 overflow-hidden p-0 sm:rounded-2xl">
          <div className="border-b border-sgvu-navy/8 bg-gradient-to-r from-sgvu-navy/[0.04] to-sgvu-gold/10 px-6 py-5">
            <DialogHeader className="space-y-1.5 text-left">
              <DialogTitle className="text-lg text-sgvu-navy">
                Upload admission document
              </DialogTitle>
              <DialogDescription className="text-sm leading-relaxed">
                Add a certificate for university verification. Clear scans work
                best — PDF, JPG, or PNG, max 5 MB.
              </DialogDescription>
            </DialogHeader>
            <ol className="mt-4 grid grid-cols-3 gap-2 text-[11px] font-semibold uppercase tracking-wide text-sgvu-navy/55">
              <li className="rounded-lg border border-sgvu-navy/10 bg-white/80 px-2 py-1.5 text-center">
                1. Type
              </li>
              <li className="rounded-lg border border-sgvu-navy/10 bg-white/80 px-2 py-1.5 text-center">
                2. Details
              </li>
              <li className="rounded-lg border border-sgvu-navy/10 bg-white/80 px-2 py-1.5 text-center">
                3. File
              </li>
            </ol>
          </div>

          <div className="space-y-4 px-6 py-5">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Document type
              </label>
              <select
                className={cn(
                  'mt-2 h-11 w-full rounded-xl border border-input bg-background px-4 text-sm text-sgvu-navy',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgvu-navy/30',
                )}
                value={uploadTitle}
                onChange={(e) =>
                  setUploadTitle(
                    e.target.value as (typeof DOC_TITLE_OPTIONS)[number],
                  )
                }
              >
                {DOC_TITLE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            {uploadTitle === 'Other' ? (
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Custom title
                </label>
                <Input
                  className="mt-2"
                  placeholder="e.g. Disability certificate"
                  value={uploadCustomTitle}
                  onChange={(e) => setUploadCustomTitle(e.target.value)}
                />
              </div>
            ) : null}

            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Issuer <span className="normal-case tracking-normal text-muted-foreground/70">(optional)</span>
              </label>
              <Input
                className="mt-2"
                placeholder="e.g. CBSE / State Board / University"
                value={uploadIssuer}
                onChange={(e) => setUploadIssuer(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Document file
              </label>
              <OnboardingDocDropzone
                label="Admission document"
                hint="Drag & drop or browse · PDF / JPG / PNG · Max 5 MB"
                fileName={uploadFile?.name ?? null}
                disabled={uploading}
                onFile={(file) => setUploadFile(file)}
              />
              {uploadFile ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Selected · {(uploadFile.size / 1024).toFixed(0)} KB — status will
                  be <span className="font-semibold text-amber-700">Pending</span>{' '}
                  after upload
                </p>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  Your file stays private to your vault until staff verifies it.
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 border-t border-sgvu-navy/8 bg-slate-50/80 px-6 py-4 sm:gap-2">
            <Button
              variant="outline"
              disabled={uploading}
              className="border-sgvu-navy/15"
              onClick={() => setUploadOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className={cn(vaultActionBtn, uploading && vaultActionBtnActive)}
              disabled={uploading || !uploadFile}
              onClick={() => void handleUpload()}
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading…
                </>
              ) : (
                'Upload for verification'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </StudentPageShell>
  );
}
