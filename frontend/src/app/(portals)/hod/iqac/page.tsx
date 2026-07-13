'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/lib/notifications/falcon-toast';
import { useAuth } from '@/context/AuthContext';
import { useAuthedApi } from '@/lib/api';
import { getApiBaseUrl } from '@/lib/api-base-url';
import { getSubdomainFromClient } from '@/lib/tenant';
import { downloadAuthedFile } from '@/lib/hod-download';
import {
  HodPageFrame,
  HodPageHeader,
  HodPanel,
} from '@/components/hod/HodPagePrimitives';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Send,
  CheckSquare,
  UploadCloud,
  FileCheck,
  Paperclip,
  Trash2,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type CriteriaItem = {
  id: number;
  code: string;
  name: string;
  completion: number;
  status: 'PENDING' | 'READY' | 'SUBMITTED';
  owner: string;
  evidence_file?: string | null;
};

type CompilerPayload = {
  academic_year: string;
  department_name: string;
  submitted: boolean;
  submitted_at?: string | null;
  submission_comments?: string | null;
  master_file?: string | null;
  overall_progress: number;
  criteria: CriteriaItem[];
};

async function uploadSingleFile(token: string, file: File) {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch(`${getApiBaseUrl()}/uploads/single`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-subdomain': getSubdomainFromClient(),
    },
    body: formData,
  });
  if (!response.ok) {
    throw new Error('File upload failed');
  }
  return response.json() as Promise<{
    path?: string;
    url?: string;
    originalname?: string;
  }>;
}

export default function HodIqacPage() {
  const router = useRouter();
  const { token } = useAuth();
  const api = useAuthedApi();
  const criterionInputRef = useRef<HTMLInputElement>(null);
  const masterInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingCriterionId, setUploadingCriterionId] = useState<number | null>(null);
  const [uploadingMaster, setUploadingMaster] = useState(false);
  const [compiler, setCompiler] = useState<CompilerPayload | null>(null);
  const [comment, setComment] = useState('');
  const [masterFile, setMasterFile] = useState<{ name: string; path: string } | null>(null);
  const [expandedCriterionId, setExpandedCriterionId] = useState<number | null>(null);
  const [nudgedIds, setNudgedIds] = useState<Record<number, boolean>>({});
  const [exportingKey, setExportingKey] = useState<string | null>(null);
  const [pendingCriterionUploadId, setPendingCriterionUploadId] = useState<number | null>(null);

  const loadCompiler = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await api.get<CompilerPayload>('/api/academics/hod/iqac/compiler');
      setCompiler(payload);
      if (payload.submission_comments) {
        setComment(payload.submission_comments);
      }
      if (payload.master_file) {
        setMasterFile({ name: payload.master_file, path: '' });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load IQAC compiler');
      setCompiler(null);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void loadCompiler();
  }, [loadCompiler]);

  const criteria = compiler?.criteria ?? [];
  const submitted = compiler?.submitted ?? false;
  const totalCriteria = criteria.length || 7;
  const totalCompleted = criteria.filter((c) => c.status === 'READY' || c.status === 'SUBMITTED').length;
  const pendingCount = criteria.filter((c) => c.status === 'PENDING').length;
  const overallProgress = compiler?.overall_progress ?? 0;
  const canSubmit = !submitted && pendingCount === 0 && totalCompleted === totalCriteria;

  async function downloadLmsAudit() {
    if (!token) {
      toast.error('Please sign in to export');
      return;
    }
    setExportingKey('lms');
    try {
      await downloadAuthedFile(
        '/api/academics/hod/faculty-audit/export',
        token,
        `lms-lesson-plans-audit-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
      toast.success('LMS audit export downloaded');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExportingKey(null);
    }
  }

  function handleToggleCriterionUpload(id: number) {
    setExpandedCriterionId((prev) => (prev === id ? null : id));
  }

  function promptCriterionUpload(id: number) {
    setPendingCriterionUploadId(id);
    criterionInputRef.current?.click();
  }

  async function handleCriterionFileSelected(file: File | undefined) {
    const criterionId = pendingCriterionUploadId;
    setPendingCriterionUploadId(null);
    if (!file || !criterionId || !token) return;

    setUploadingCriterionId(criterionId);
    try {
      const uploaded = await uploadSingleFile(token, file);
      await api.post('/api/academics/hod/iqac/evidence', {
        criterion_id: criterionId,
        file_path: uploaded.path ?? uploaded.url,
        file_name: uploaded.originalname ?? file.name,
      });
      toast.success(`Evidence uploaded for ${criteria.find((c) => c.id === criterionId)?.code ?? 'criterion'}`);
      await loadCompiler();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploadingCriterionId(null);
    }
  }

  async function handleMasterFileSelected(file: File | undefined) {
    if (!file || !token) return;
    setUploadingMaster(true);
    try {
      const uploaded = await uploadSingleFile(token, file);
      setMasterFile({
        name: uploaded.originalname ?? file.name,
        path: uploaded.path ?? uploaded.url ?? '',
      });
      toast.success('Master SSR package uploaded');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploadingMaster(false);
    }
  }

  function handleNudgeCoordinator(id: number, owner: string) {
    setNudgedIds((prev) => ({ ...prev, [id]: true }));
    toast.success(`Reminder logged for coordinator (${owner}).`);
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await api.post('/api/academics/hod/iqac/submit', {
        comments: comment,
        master_file_path: masterFile?.path || undefined,
        master_file_name: masterFile?.name || undefined,
      });
      toast.success('Department self-study reports submitted to the IQAC cell.');
      await loadCompiler();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <HodPageFrame>
      <input
        ref={criterionInputRef}
        type="file"
        accept=".pdf,.zip,.doc,.docx"
        className="hidden"
        onChange={(e) => void handleCriterionFileSelected(e.target.files?.[0])}
      />
      <input
        ref={masterInputRef}
        type="file"
        accept=".pdf,.zip"
        className="hidden"
        onChange={(e) => void handleMasterFileSelected(e.target.files?.[0])}
      />

      <HodPageHeader
        title="IQAC Quality Assurance Portal"
        description="Compile, audit, and submit departmental self-study reports to the university IQAC cell for NAAC/NIRF compliance."
        meta={
          <div className="flex items-center gap-3">
            <span className={cn(
              "px-2 py-0.5 rounded-full text-xs font-bold border",
              submitted
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-amber-50 text-amber-700 border-amber-200 animate-pulse"
            )}>
              {submitted ? 'Department Report Submitted' : 'Accreditation Cycle Active'}
            </span>
            <span>·</span>
            <span className="text-muted-foreground text-xs">
              {compiler?.department_name ?? 'Department'} · {compiler?.academic_year}
            </span>
            <span>·</span>
            <span className={cn(
              "px-2 py-0.5 rounded-full text-xs font-bold border",
              submitted
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : canSubmit
                  ? "bg-blue-50 text-blue-700 border-blue-200"
                  : "bg-slate-50 text-slate-700 border-slate-200"
            )}>
              {submitted
                ? 'All criteria submitted'
                : `${totalCompleted}/${totalCriteria} Ready for Submit`}
            </span>
            {!submitted && canSubmit && (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold border bg-emerald-50 text-emerald-700 border-emerald-200">
                Submit unlocked
              </span>
            )}
          </div>
        }
      />

      {loading && (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-sgvu-gold" />
        </div>
      )}

      {!loading && (
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8 space-y-6">
          <HodPanel title="Accreditation Progress Summary" count={totalCompleted}>
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-blue-700">Submit readiness</p>
                  <p className="mt-1 text-lg font-bold text-sgvu-navy">
                    {totalCompleted}/{totalCriteria} criteria ready
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {canSubmit
                      ? 'All criteria have evidence. You can submit now.'
                      : `${pendingCount} criterion${pendingCount === 1 ? '' : 's'} still need evidence.`}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Evidence depth</p>
                  <p className="mt-1 text-lg font-bold text-sgvu-navy">{overallProgress}%</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Depth score — not file count. Grows with faculty IQAC submissions.
                  </p>
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Dept evidence depth (faculty + HOD uploads)</span>
                  <span className="font-bold text-sgvu-navy">{overallProgress}%</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-100 border border-slate-200/50">
                  <div
                    className="h-full rounded-full bg-sgvu-navy transition-all duration-500"
                    style={{ width: `${overallProgress}%` }}
                  />
                </div>
              </div>
              <div className="rounded-lg border border-amber-100 bg-amber-50/60 p-2.5 text-[11px] text-amber-900 leading-relaxed">
                <strong>How to read this:</strong> Upload one PDF per criterion to mark it <strong>READY</strong>.
                The depth % can stay low (e.g. 28%) in large departments — that is normal.
                Submit needs <strong>{totalCriteria}/{totalCriteria} READY</strong>, not 100% depth.
              </div>
            </div>
          </HodPanel>

          <div className="space-y-4">
            <h3 className="text-sm font-bold text-sgvu-navy flex items-center gap-2">
              <CheckSquare className="h-4 w-4 text-sgvu-gold" />
              NAAC Self-Study Report (SSR) Criteria Checklist
            </h3>

            <div className="space-y-3">
              {criteria.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "flex flex-col p-4 rounded-xl border bg-white transition-all space-y-3",
                    item.status === 'PENDING' ? "border-amber-100 bg-amber-50/10" : "border-slate-100 hover:border-slate-200"
                  )}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-muted-foreground uppercase">{item.code}</span>
                        <span className={cn(
                          "rounded-md px-1.5 py-0.5 text-[10px] font-bold border",
                          item.status === 'SUBMITTED' ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                          item.status === 'READY' ? "bg-blue-50 text-blue-700 border-blue-100" : "bg-amber-50 text-amber-700 border-amber-100"
                        )}>
                          {item.status}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-sgvu-navy">{item.name}</h4>
                      <p className="text-xs text-muted-foreground">Criterion Coordinator: <span className="font-medium">{item.owner}</span></p>
                      {item.evidence_file ? (
                        <p className="text-[10px] text-emerald-700 font-medium">Vault: {item.evidence_file}</p>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-4 shrink-0 justify-between md:justify-end">
                      <div className="text-right">
                        <p className="text-sm font-bold text-sgvu-navy">{item.completion}%</p>
                        <p className="text-[10px] text-muted-foreground">Depth</p>
                      </div>
                      <div className="w-20 bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200/50 mr-2">
                        <div className={cn(
                          "h-full rounded-full",
                          item.completion === 100 ? "bg-emerald-500" : "bg-sgvu-gold"
                        )} style={{ width: `${item.completion}%` }} />
                      </div>

                      {item.status === 'PENDING' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleNudgeCoordinator(item.id, item.owner)}
                          disabled={nudgedIds[item.id] || submitted}
                          className={cn(
                            "text-xs font-bold gap-1.5 h-8 px-2.5 rounded-lg border shrink-0",
                            nudgedIds[item.id]
                              ? "bg-slate-50 border-slate-200 text-slate-400"
                              : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800"
                          )}
                        >
                          <Send className="h-3.5 w-3.5" />
                          <span>{nudgedIds[item.id] ? "Nudged" : "Nudge"}</span>
                        </Button>
                      )}

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleCriterionUpload(item.id)}
                        disabled={submitted || uploadingCriterionId === item.id}
                        className="text-sgvu-navy hover:text-sgvu-gold hover:bg-slate-50 text-xs font-bold gap-1.5 h-8 px-2.5 rounded-lg border border-slate-100 shrink-0"
                      >
                        {uploadingCriterionId === item.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Paperclip className="h-3.5 w-3.5 text-sgvu-navy" />
                        )}
                        {item.evidence_file ? "View/Change" : "Upload Evidence"}
                      </Button>
                    </div>
                  </div>

                  {expandedCriterionId === item.id && (
                    <div className="border-t border-slate-100 pt-3">
                      <button
                        type="button"
                        onClick={() => promptCriterionUpload(item.id)}
                        disabled={submitted || uploadingCriterionId === item.id}
                        className="border-2 border-dashed border-slate-200 hover:border-sgvu-navy/40 rounded-lg p-5 w-full flex flex-col items-center justify-center text-slate-500 hover:bg-slate-50 cursor-pointer transition-all duration-200 bg-slate-50/10 disabled:opacity-60"
                      >
                        <UploadCloud className="h-5 w-5 text-slate-400 mb-1" />
                        {item.evidence_file ? (
                          <div className="text-center space-y-0.5">
                            <p className="text-[10px] font-bold text-emerald-600 flex items-center gap-1 justify-center">
                              <CheckCircle2 className="h-3 w-3" /> Evidence on file
                            </p>
                            <p className="text-xs font-bold text-sgvu-navy truncate px-6">{item.evidence_file}</p>
                            <p className="text-[9px] text-muted-foreground">Click to upload another document</p>
                          </div>
                        ) : (
                          <div className="text-center">
                            <p className="text-xs font-bold text-sgvu-navy">Upload Supporting Evidence for {item.code}</p>
                            <p className="text-[9px] text-muted-foreground mt-0.5">PDF or ZIP up to 20MB</p>
                          </div>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 space-y-6">
          <Card className="border-gray-100 shadow-sm bg-white overflow-hidden relative">
            <div className="absolute left-0 top-0 h-full w-1 bg-sgvu-gold" />
            <CardHeader className="bg-slate-50/50 pb-4 border-b border-gray-100">
              <CardTitle className="text-base font-bold text-sgvu-navy flex items-center gap-2">
                <FileCheck className="h-5 w-5 text-sgvu-navy" />
                Submit Department Data
              </CardTitle>
              <CardDescription className="text-xs">
                Once submitted, files are locked and forwarded to the IQAC central repository.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              {canSubmit && (
                <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-100 rounded-lg p-2.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-emerald-800 leading-normal">
                    All {totalCriteria} criteria are READY. Add master SSR (optional), write comments, then submit to IQAC cell.
                  </p>
                </div>
              )}
              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 space-y-2">
                <h4 className="text-xs font-bold text-sgvu-navy uppercase">Audit Checklist</h4>
                <ul className="space-y-1.5 text-xs text-muted-foreground">
                  <li className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    <span>Faculty IQAC task submissions included</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    <span>Department evidence mapped to NAAC criteria</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    <span>Central vault sync on submit</span>
                  </li>
                </ul>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase">Upload Final Department SSR / Compiled Evidence (PDF/ZIP)</label>
                <div
                  role="button"
                  tabIndex={submitted || uploadingMaster ? -1 : 0}
                  onClick={() => {
                    if (!submitted && !uploadingMaster) masterInputRef.current?.click();
                  }}
                  onKeyDown={(e) => {
                    if (submitted || uploadingMaster) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      masterInputRef.current?.click();
                    }
                  }}
                  aria-disabled={submitted || uploadingMaster}
                  className="border-2 border-dashed border-slate-200 hover:border-sgvu-navy/40 rounded-xl p-4 w-full flex flex-col items-center justify-center text-slate-500 hover:bg-slate-50 cursor-pointer transition-all duration-200 bg-slate-50/20 disabled:opacity-60 aria-disabled:opacity-60 aria-disabled:cursor-not-allowed aria-disabled:hover:bg-slate-50/20"
                >
                  <UploadCloud className="h-6 w-6 text-slate-400 mb-1" />
                  {uploadingMaster ? (
                    <Loader2 className="h-5 w-5 animate-spin text-sgvu-gold" />
                  ) : masterFile ? (
                    <div className="text-center space-y-0.5 relative w-full">
                      <p className="text-[10px] font-bold text-emerald-600 flex items-center gap-1 justify-center">
                        <CheckCircle2 className="h-3.5 w-3.5" /> File Uploaded
                      </p>
                      <p className="text-xs font-bold text-sgvu-navy truncate px-6">{masterFile.name}</p>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMasterFile(null);
                          toast.info('Master submission archive removed.');
                        }}
                        className="absolute right-0 top-0 text-red-500 hover:text-red-700 transition p-1 hover:bg-red-50 rounded"
                        title="Remove file"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="text-center">
                      <p className="text-xs font-semibold text-sgvu-navy">Drag & drop or Click to upload</p>
                      <p className="text-[9px] text-muted-foreground">PDF or ZIP up to 20MB</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase" htmlFor="submission-comments">HOD Audit Comments</label>
                <textarea
                  id="submission-comments"
                  className="w-full border border-slate-200 rounded-xl p-3 text-xs focus:outline-none focus:ring-2 focus:ring-sgvu-gold bg-slate-50/20"
                  rows={4}
                  placeholder="Provide audit remarks or compiler comments..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  disabled={submitted}
                />
              </div>

              <Button
                className="w-full bg-sgvu-navy hover:bg-sgvu-navy/90 text-white rounded-xl h-11 text-sm font-semibold transition"
                onClick={() => void handleSubmit()}
                disabled={submitting || submitted || criteria.some((c) => c.status === 'PENDING')}
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Locking & Submitting...
                  </span>
                ) : submitted ? (
                  <span className="flex items-center justify-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-sgvu-gold" />
                    Submitted to IQAC Cell
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <Send className="h-4 w-4 text-sgvu-gold" />
                    Submit Department Data
                  </span>
                )}
              </Button>

              {criteria.some((c) => c.status === 'PENDING') && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-lg p-2.5">
                  <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-amber-700 leading-normal">
                    Upload evidence or wait for faculty IQAC submissions until all criteria are marked READY.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <HodPanel title="Accreditation Exports">
            <div className="space-y-3">
              <button
                type="button"
                className="w-full flex items-center justify-between rounded-xl border border-slate-100 hover:border-slate-200 bg-white p-3 text-xs font-semibold text-sgvu-navy shadow-sm transition"
                onClick={() => router.push('/hod/faculty/appraisals')}
              >
                <span className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                  Faculty Research API Scores
                </span>
                <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded text-muted-foreground">Live</span>
              </button>

              <button
                type="button"
                className="w-full flex items-center justify-between rounded-xl border border-slate-100 hover:border-slate-200 bg-white p-3 text-xs font-semibold text-sgvu-navy shadow-sm transition"
                onClick={() => router.push('/hod/dashboard?tab=results')}
              >
                <span className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                  Student Marks Compliance
                </span>
                <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded text-muted-foreground">Export</span>
              </button>

              <button
                type="button"
                disabled={exportingKey === 'lms'}
                className="w-full flex items-center justify-between rounded-xl border border-slate-100 hover:border-slate-200 bg-white p-3 text-xs font-semibold text-sgvu-navy shadow-sm transition disabled:opacity-60"
                onClick={() => void downloadLmsAudit()}
              >
                <span className="flex items-center gap-2">
                  <UploadCloud className="h-4 w-4 text-blue-600" />
                  LMS Lesson Plans Audit
                </span>
                <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded text-muted-foreground">
                  {exportingKey === 'lms' ? '…' : 'XLSX'}
                </span>
              </button>
            </div>
          </HodPanel>
        </div>
      </div>
      )}
    </HodPageFrame>
  );
}
