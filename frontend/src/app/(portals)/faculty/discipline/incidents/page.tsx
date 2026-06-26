'use client';

import { Select } from '@/components/ui/select';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Upload } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import {
  FacultyEmptyState,
  FacultyPageHeader,
  FacultyPageLoading,
  FacultyPageShell,
} from '@/components/faculty';

type StudentOption = {
  user_id: string;
  name: string;
  enrollment_number: string | null;
};

type CourseOption = {
  course_id: string;
  course_code: string;
  course_name: string;
};

type DemeritIncident = {
  incident_id: string;
  student_name: string;
  course_code: string;
  course_name: string;
  category: string;
  points: number;
  description: string;
  status: string;
  evidence_urls: string[];
  created_at: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  PLAGIARISM: 'Plagiarism',
  BEHAVIORAL: 'Behavioral',
  ATTENDANCE: 'Attendance',
  EXAM_MALPRACTICE: 'Exam Malpractice',
};

function statusBadge(status: string) {
  if (status === 'PENDING_DC_REVIEW') return { label: 'Pending DC Review', variant: 'outline' as const };
  if (status === 'APPROVED_BY_DC') return { label: 'Approved by DC', variant: 'default' as const };
  if (status === 'REJECTED_BY_DC') return { label: 'Rejected by DC', variant: 'secondary' as const };
  return { label: status, variant: 'outline' as const };
}

export default function FacultyDisciplineIncidentsPage() {
  const api = useAuthedApi();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [history, setHistory] = useState<DemeritIncident[]>([]);
  const [form, setForm] = useState({
    student_pick: '',
    student_ref: '',
    subject_id: '',
    category: 'BEHAVIORAL',
    points: '1',
    description: '',
    evidence_urls: [] as string[],
  });

  const refreshHistory = useCallback(async () => {
    const rows = await api.get<DemeritIncident[]>('/api/demerits/faculty/history');
    setHistory(rows ?? []);
  }, [api]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [options, rows] = await Promise.all([
          api.get<{ students: StudentOption[]; courses: CourseOption[]; categories: string[] }>(
            '/api/demerits/form-options',
          ),
          api.get<DemeritIncident[]>('/api/demerits/faculty/history'),
        ]);
        if (cancelled) return;
        setStudents(options.students ?? []);
        setCourses(options.courses ?? []);
        setHistory(rows ?? []);
      } catch {
        if (!cancelled) toast.error('Could not load disciplinary form');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const studentRef = useMemo(
    () => form.student_ref.trim() || form.student_pick.trim(),
    [form.student_pick, form.student_ref],
  );

  async function uploadEvidence(file: File) {
    setUploading(true);
    try {
      const token = localStorage.getItem('token');
      const tenant = localStorage.getItem('tenant_subdomain') ?? 'sgvu';
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${apiUrl}/uploads/single`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token ?? ''}`,
          'x-tenant-subdomain': tenant,
        },
        body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');
      const uploaded = (await res.json()) as { url?: string; path?: string };
      const url = uploaded.url ?? uploaded.path ?? '';
      if (!url) throw new Error('No file URL returned');
      setForm((f) => ({ ...f, evidence_urls: [...f.evidence_urls, url] }));
      toast.success('Evidence uploaded');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function submitIncident() {
    if (!studentRef) {
      toast.error('Select a student');
      return;
    }
    if (!form.subject_id) {
      toast.error('Select a subject/course');
      return;
    }
    if (!form.description.trim()) {
      toast.error('Enter incident description');
      return;
    }
    setBusy(true);
    try {
      await api.post('/api/demerits/submit', {
        student_id: studentRef,
        subject_id: form.subject_id,
        category: form.category,
        points: Number(form.points),
        description: form.description.trim(),
        evidence_urls: form.evidence_urls,
      });
      toast.success('Incident submitted to Disciplinary Committee');
      setForm({
        student_pick: '',
        student_ref: '',
        subject_id: '',
        category: 'BEHAVIORAL',
        points: '1',
        description: '',
        evidence_urls: [],
      });
      await refreshHistory();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Submit failed');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <FacultyPageLoading label="Loading disciplinary incident form…" branded />;
  }

  return (
    <FacultyPageShell>
      <FacultyPageHeader
        title="Log Disciplinary Incident"
        description="Faculty can report incidents only. Demerit points are applied only after DC approval."
      />

      <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        <p>
          Submitting this incident routes it to the Disciplinary Committee for formal review.{' '}
          <strong>6 approved points will result in an automatic Subject Back.</strong>
        </p>
      </div>

      <Card className="mb-6 border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">New incident report</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Student</label>
              <Select
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={form.student_pick}
                onChange={(e) => setForm((f) => ({ ...f, student_pick: e.target.value, student_ref: '' }))}
              >
                <option value="">Select student</option>
                {students.map((s) => (
                  <option key={s.user_id} value={s.user_id}>
                    {s.name}
                    {s.enrollment_number ? ` · ${s.enrollment_number}` : ''}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Or enrollment / email</label>
              <Input
                placeholder="e.g. SGVU-2026-1004"
                value={form.student_ref}
                onChange={(e) => setForm((f) => ({ ...f, student_ref: e.target.value, student_pick: '' }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Subject / course</label>
              <Select
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={form.subject_id}
                onChange={(e) => setForm((f) => ({ ...f, subject_id: e.target.value }))}
              >
                <option value="">Select subject</option>
                {courses.map((c) => (
                  <option key={c.course_id} value={c.course_id}>
                    {c.course_code} — {c.course_name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Category</label>
              <Select
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              >
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Points requested</label>
              <Input
                type="number"
                min={1}
                max={6}
                value={form.points}
                onChange={(e) => setForm((f) => ({ ...f, points: e.target.value }))}
              />
            </div>
          </div>

          <textarea
            className="min-h-[100px] w-full rounded-md border px-3 py-2 text-sm"
            placeholder="Describe the incident in detail"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />

          <div>
            <label className="mb-2 block text-xs font-medium text-muted-foreground">Evidence (optional)</label>
            <Button size="sm" variant="outline" disabled={uploading} asChild>
              <label className="cursor-pointer">
                <Upload className="mr-2 h-4 w-4 inline" />
                {uploading ? 'Uploading…' : 'Upload file'}
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadEvidence(file);
                    e.target.value = '';
                  }}
                />
              </label>
            </Button>
            {form.evidence_urls.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {form.evidence_urls.map((url) => {
                  const isImage = url.match(/\.(jpeg|jpg|gif|png|webp|avif)$/i) != null;
                  return (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="group relative block overflow-hidden rounded-md border shadow-sm transition-all hover:shadow-md"
                    >
                      {isImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={url}
                          alt="Evidence"
                          className="h-16 w-16 object-cover transition-opacity group-hover:opacity-80"
                        />
                      ) : (
                        <div className="flex h-16 w-16 items-center justify-center bg-muted text-xs font-medium text-muted-foreground transition-colors group-hover:bg-muted/80">
                          {url.split('.').pop()?.toUpperCase() || 'FILE'}
                        </div>
                      )}
                    </a>
                  );
                })}
              </div>
            ) : null}
          </div>

          <Button disabled={busy || uploading} onClick={() => void submitIncident()}>
            Submit to Disciplinary Committee
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Your submitted incidents</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <FacultyEmptyState description="No incidents submitted yet." />
          ) : (
            <div className="space-y-3">
              {history.map((row) => {
                const badge = statusBadge(row.status);
                return (
                  <div key={row.incident_id} className="rounded-lg border px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-sgvu-navy">
                        {row.student_name} · {row.course_code}
                      </p>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </div>
                    <p className="mt-1 text-muted-foreground">
                      {CATEGORY_LABELS[row.category] ?? row.category} · {row.points} point(s)
                    </p>
                    <p className="mt-1">{row.description}</p>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </FacultyPageShell>
  );
}
