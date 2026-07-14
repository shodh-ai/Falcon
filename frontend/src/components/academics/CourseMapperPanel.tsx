'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  Upload,
  UserCircle2,
} from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { API_URL } from '@/lib/api/client';
import { getSubdomainFromClient } from '@/lib/tenant';
import { cn } from '@/lib/utils';

type PreviewRow = {
  row_number: number;
  faculty_username: string;
  subject_fullname: string;
  subject_code: string;
  sub_type: string;
  semester: string;
  program_name: string;
  credits: number;
  is_new_subject: boolean;
  is_unassigned: boolean;
  faculty_user_id: string | null;
  faculty_name: string | null;
  faculty_email: string | null;
  warnings: string[];
};

type PreviewPayload = {
  rows: PreviewRow[];
  summary: {
    total: number;
    new_subjects: number;
    unassigned: number;
    faculty_matched: number;
    warnings: number;
  };
};

type ExecuteResult = {
  subjects_created: number;
  subjects_updated: number;
  allocations_created: number;
  courses_provisioned: number;
  workspaces_assigned: number;
  unassigned_count: number;
};

const REQUIRED_HEADERS = [
  'faculty username',
  'subject fullname',
  'subject code',
  'sub type',
  'semester',
  'program name',
  'credits',
];

function normalizeHeader(h: string) {
  return h.trim().toLowerCase();
}

async function validateCsvHeaders(file: File): Promise<boolean> {
  if (!file.name.toLowerCase().endsWith('.csv')) return true;
  const text = await file.slice(0, 2048).text();
  const firstLine = text.split(/\r?\n/)[0] ?? '';
  const headers = firstLine.split(',').map(normalizeHeader);
  const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
  if (missing.length) {
    toast.error(`Missing columns: ${missing.join(', ')}`);
    return false;
  }
  return true;
}

export function CourseMapperPanel({
  apiPrefix = '/api/academics/hod/course-mapper',
  title = 'Upload Teaching Load Matrix',
  description = 'Upload your department Course Allocation Matrix (Excel). Falcon will auto-create subjects, map faculty, provision LMS workspaces, and flag unassigned (NF) rows for follow-up.',
}: {
  apiPrefix?: string;
  title?: string;
  description?: string;
}) {
  const { token } = useAuth();
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload');
  const [academicYear, setAcademicYear] = useState('2026-2027');
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [result, setResult] = useState<ExecuteResult | null>(null);
  const [fileName, setFileName] = useState('');

  const authHeaders = useMemo(
    () => ({
      Authorization: `Bearer ${token}`,
      'x-tenant-subdomain': getSubdomainFromClient(),
    }),
    [token],
  );

  async function downloadTemplate() {
    if (!token) return;
    const res = await fetch(`${API_URL}${apiPrefix}/template`, {
      headers: authHeaders,
    });
    if (!res.ok) {
      toast.error('Failed to download template');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'course-allocation-matrix-template.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  }

  const uploadForPreview = useCallback(
    async (file: File) => {
      if (!token) return;
      if (!academicYear.trim()) {
        toast.error('Enter the academic year first');
        return;
      }
      const ok = await validateCsvHeaders(file);
      if (!ok) return;

      setLoading(true);
      setFileName(file.name);
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch(`${API_URL}${apiPrefix}/preview`, {
          method: 'POST',
          headers: authHeaders,
          body: formData,
        });
        const text = await res.text();
        if (!res.ok) {
          let msg = text;
          try {
            const parsed = JSON.parse(text) as { message?: string };
            if (parsed.message) msg = parsed.message;
          } catch {
            /* keep raw */
          }
          throw new Error(msg);
        }
        const data = JSON.parse(text) as PreviewPayload;
        setPreview(data);
        setStep('preview');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Preview failed');
      } finally {
        setLoading(false);
      }
    },
    [token, authHeaders, academicYear, apiPrefix],
  );

  async function confirmExecute() {
    if (!token || !preview) return;
    setExecuting(true);
    try {
      const res = await fetch(`${API_URL}${apiPrefix}/execute`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          academic_year: academicYear.trim(),
          rows: preview.rows.map((r) => ({
            faculty_username: r.faculty_username,
            subject_fullname: r.subject_fullname,
            subject_code: r.subject_code,
            sub_type: r.sub_type,
            semester: r.semester,
            program_name: r.program_name,
            credits: r.credits,
          })),
        }),
      });
      const text = await res.text();
      if (!res.ok) {
        let msg = text;
        try {
          const parsed = JSON.parse(text) as { message?: string };
          if (parsed.message) msg = parsed.message;
        } catch {
          /* keep raw */
        }
        throw new Error(msg);
      }
      const data = JSON.parse(text) as ExecuteResult;
      setResult(data);
      setStep('done');
      toast.success('Teaching load matrix imported successfully');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setExecuting(false);
    }
  }

  function reset() {
    setStep('upload');
    setPreview(null);
    setResult(null);
    setFileName('');
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-sgvu-navy">{title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>
      </div>

      {step === 'upload' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Step 1 — Upload matrix</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-w-xs space-y-2">
              <label className="text-sm font-medium">Academic year</label>
              <Input
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                placeholder="2026-2027"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Required columns: Faculty username, Subject Fullname, Subject Code, Sub Type, Semester,
              Program Name, Credits. Use &quot;NF&quot; for unassigned faculty.
            </p>
            <Button variant="outline" className="gap-2" onClick={() => void downloadTemplate()}>
              <Download className="h-4 w-4" />
              Download template
            </Button>
            <div
              className={cn(
                'rounded-xl border-2 border-dashed p-12 text-center transition-colors',
                dragOver ? 'border-sgvu-navy bg-muted/50' : 'border-border',
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const file = e.dataTransfer.files[0];
                if (file) void uploadForPreview(file);
              }}
            >
              <Upload className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="mt-3 text-base font-medium">Drop .xlsx or .csv here</p>
              <p className="mt-1 text-sm text-muted-foreground">Teaching load matrix for your department</p>
              <label className="mt-4 inline-block">
                <input
                  type="file"
                  className="hidden"
                  accept=".xlsx,.xls,.csv"
                  disabled={loading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadForPreview(file);
                  }}
                />
                <Button variant="secondary" disabled={loading} asChild>
                  <span className="gap-2">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {loading ? 'Parsing…' : 'Choose file'}
                  </span>
                </Button>
              </label>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'preview' && preview && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Step 2 — Preview & confirm</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3 text-sm">
              <span className="rounded-full bg-muted px-3 py-1">
                {preview.summary.total} rows · {fileName}
              </span>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-800">
                {preview.summary.new_subjects} new subjects
              </span>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-900">
                {preview.summary.unassigned} unassigned (NF)
              </span>
              <span className="rounded-full bg-blue-100 px-3 py-1 text-blue-900">
                {preview.summary.faculty_matched} faculty matched
              </span>
            </div>
            <div className="overflow-x-auto rounded-lg border">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Faculty</th>
                    <th className="px-3 py-2">Subject</th>
                    <th className="px-3 py-2">Program / Sem</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {preview.rows.map((row) => (
                    <tr
                      key={row.row_number}
                      className={cn(
                        row.is_unassigned && 'bg-amber-50/80',
                        row.is_new_subject && !row.is_unassigned && 'bg-emerald-50/50',
                      )}
                    >
                      <td className="px-3 py-2 text-muted-foreground">{row.row_number}</td>
                      <td className="px-3 py-2">
                        {row.is_unassigned ? (
                          <span className="font-medium text-amber-800">NF — Unassigned</span>
                        ) : row.faculty_name ? (
                          <div className="flex items-center gap-2">
                            <UserCircle2 className="h-8 w-8 text-sgvu-navy/70" />
                            <div>
                              <p className="font-medium">{row.faculty_name}</p>
                              <p className="text-xs text-muted-foreground">{row.faculty_username}</p>
                            </div>
                          </div>
                        ) : (
                          <span className="text-destructive">{row.faculty_username} — not found</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <p className="font-medium">{row.subject_fullname}</p>
                        <p className="text-xs text-muted-foreground">
                          {row.subject_code} · {row.sub_type} · {row.credits} cr
                        </p>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {row.program_name}
                        <br />
                        {row.semester}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-1">
                          {row.is_new_subject && (
                            <span className="inline-flex w-fit items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                              New Subject — Will Auto-Create
                            </span>
                          )}
                          {row.is_unassigned && (
                            <span className="inline-flex w-fit items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                              Unassigned
                            </span>
                          )}
                          {row.warnings.map((w) => (
                            <span
                              key={w}
                              className="inline-flex w-fit items-center gap-1 text-xs text-destructive"
                            >
                              <AlertTriangle className="h-3 w-3" />
                              {w}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={reset}>
                Back
              </Button>
              <Button disabled={executing} onClick={() => void confirmExecute()}>
                {executing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importing…
                  </>
                ) : (
                  'Confirm & Import'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'done' && result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-emerald-700">
              <CheckCircle2 className="h-5 w-5" />
              Import complete
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              Created {result.subjects_created} subjects, updated {result.subjects_updated},{' '}
              {result.allocations_created} allocations, {result.courses_provisioned} LMS courses,{' '}
              {result.workspaces_assigned} faculty workspaces assigned.
            </p>
            {result.unassigned_count > 0 && (
              <p className="text-amber-800">
                {result.unassigned_count} row(s) saved as unassigned — assign faculty from Unassigned
                Teaching Load.
              </p>
            )}
            <Button onClick={reset}>Import another file</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
