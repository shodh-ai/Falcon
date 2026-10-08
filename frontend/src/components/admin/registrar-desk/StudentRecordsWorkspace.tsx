'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import {
  REG_BRAND_BTN,
  REG_OUTLINE_BTN,
  RegistrarDeskChrome,
} from '@/components/admin/registrar-desk/RegistrarDeskChrome';
import { REGISTRAR_DESK } from '@/lib/api/api.registrar-desk';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PaginationBar } from '@/components/ui/PaginationBar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuthedApi } from '@/lib/api';
import { toast } from '@/lib/notifications/falcon-toast';
import { cn } from '@/lib/utils';

type StudentRow = {
  user_id: string;
  name: string;
  official_email?: string;
  enrollment_no?: string;
  program_name?: string;
  section_code?: string;
  lifecycle_status?: string;
  status?: string;
  current_semester?: number;
  department_name?: string;
};

type DocRow = {
  document_id: string;
  category?: string;
  title: string;
  file_url: string;
  created_at?: string;
};

type RecordDetail = {
  profile: {
    user_id: string;
    name: string;
    official_email?: string;
    phone?: string;
    enrollment_no?: string;
    enrollment_number?: string;
    prn_number?: string;
    program_name?: string;
    degree_name?: string;
    school_name?: string;
    batch?: string;
    current_semester?: number;
    section_code?: string;
    advisor_name?: string;
    lifecycle_status?: string;
    status?: string;
    department_name?: string;
  };
  lifecycle_history: Array<{ to_status?: string; remarks?: string; created_at?: string; changed_by_name?: string }>;
  placement_history: Array<{ program_name?: string; section_code?: string; created_at?: string; source?: string }>;
  documents: DocRow[];
};

const LIFECYCLE = [
  'ACTIVE',
  'ON_LEAVE',
  'SUSPENDED',
  'WITHDRAWN',
  'GRADUATED',
  'ALUMNI',
  'ENROLLED',
] as const;

const PAGE = 10;

export function StudentRecordsWorkspace() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RecordDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    school_name: '',
    department_name: '',
    program_name: '',
    degree_name: '',
    batch: '',
    semester: '',
    section_code: '',
    advisor_name: '',
    lifecycle_status: '',
    remarks: '',
  });
  const [docTitle, setDocTitle] = useState('');
  const [docCategory, setDocCategory] = useState('REGISTRAR');
  const [docUrl, setDocUrl] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '200', offset: '0' });
      if (q.trim()) params.set('q', q.trim());
      const data = await api.get<{ rows: StudentRow[] }>(
        `${REGISTRAR_DESK.placementStudents}?${params}`,
      );
      setRows(Array.isArray(data?.rows) ? data.rows : []);
      setOffset(0);
    } catch (e) {
      toast.error('Could not load students', {
        description: e instanceof Error ? e.message : 'Request failed',
      });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [api, q]);

  useEffect(() => {
    void load();
  }, [load]);

  const pageRows = useMemo(() => rows.slice(offset, offset + PAGE), [rows, offset]);

  async function openRecord(userId: string) {
    setSelectedId(userId);
    setDetailLoading(true);
    try {
      const data = await api.get<RecordDetail>(REGISTRAR_DESK.studentRecord(userId));
      setDetail(data);
      const p = data.profile;
      setForm({
        name: p.name ?? '',
        phone: p.phone ?? '',
        school_name: p.school_name ?? '',
        department_name: p.department_name ?? '',
        program_name: p.program_name ?? '',
        degree_name: p.degree_name ?? '',
        batch: p.batch ?? '',
        semester: p.current_semester != null ? String(p.current_semester) : '',
        section_code: p.section_code ?? '',
        advisor_name: p.advisor_name ?? '',
        lifecycle_status: (p.lifecycle_status ?? p.status ?? 'ACTIVE').toUpperCase(),
        remarks: '',
      });
    } catch (e) {
      toast.error('Could not load student record', {
        description: e instanceof Error ? e.message : 'Request failed',
      });
      setSelectedId(null);
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function saveRecord() {
    if (!selectedId) return;
    setSaving(true);
    try {
      const data = await api.patch<RecordDetail>(REGISTRAR_DESK.studentRecord(selectedId), {
        name: form.name.trim() || undefined,
        phone: form.phone.trim(),
        school_name: form.school_name.trim() || undefined,
        department_name: form.department_name.trim() || undefined,
        program_name: form.program_name.trim() || undefined,
        degree_name: form.degree_name.trim() || undefined,
        batch: form.batch.trim() || undefined,
        semester: form.semester.trim() ? Number(form.semester) : undefined,
        section_code: form.section_code.trim() || undefined,
        advisor_name: form.advisor_name.trim() || undefined,
        lifecycle_status: form.lifecycle_status || undefined,
        remarks: form.remarks.trim() || undefined,
      });
      setDetail(data);
      toast.success('Student record updated');
      void load();
    } catch (e) {
      toast.error('Update failed', {
        description: e instanceof Error ? e.message : 'Request failed',
      });
    } finally {
      setSaving(false);
    }
  }

  async function addDocument() {
    if (!selectedId) return;
    if (!docTitle.trim() || !docUrl.trim()) {
      toast.warning('Document title and file URL / data URL are required');
      return;
    }
    try {
      await api.post(REGISTRAR_DESK.studentDocuments(selectedId), {
        title: docTitle.trim(),
        category: docCategory.trim() || 'REGISTRAR',
        file_url: docUrl.trim(),
      });
      toast.success('Document added');
      setDocTitle('');
      setDocUrl('');
      await openRecord(selectedId);
    } catch (e) {
      toast.error('Document upload failed', {
        description: e instanceof Error ? e.message : 'Request failed',
      });
    }
  }

  function onFilePicked(file: File | null) {
    if (!file) return;
    if (file.size > 2_500_000) {
      toast.warning('Keep files under 2.5 MB for inline storage');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setDocUrl(String(reader.result ?? ''));
      if (!docTitle.trim()) setDocTitle(file.name);
    };
    reader.readAsDataURL(file);
  }

  return (
    <RegistrarDeskChrome
      title="Student Records"
      subtitle="View and update student academic profile, lifecycle status, and registrar document vault."
    >
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <label className="min-w-[240px] flex-1 space-y-1">
            <span className="text-xs text-muted-foreground">Search</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-10 pl-9"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Name, email, or enrollment…"
              />
            </div>
          </label>
          <Button className={cn(REG_OUTLINE_BTN)} onClick={() => void load()}>
            Refresh
          </Button>
        </CardContent>
      </Card>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardHeader className="border-b border-sgvu-navy/10 pb-3">
          <CardTitle className="text-base font-bold text-sgvu-navy">Students</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">No students found.</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table className="min-w-[900px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Enrollment</TableHead>
                      <TableHead>Program</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((r) => (
                      <TableRow key={r.user_id}>
                        <TableCell>
                          <p className="font-medium text-sgvu-navy">{r.name}</p>
                          <p className="text-xs text-muted-foreground">{r.official_email ?? '—'}</p>
                        </TableCell>
                        <TableCell className="text-sm">{r.enrollment_no ?? '—'}</TableCell>
                        <TableCell className="text-sm">
                          {r.program_name ?? '—'}
                          {r.section_code ? ` · ${r.section_code}` : ''}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="border-transparent bg-slate-100">
                            {(r.lifecycle_status ?? r.status ?? 'ACTIVE').replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" className={cn('h-8', REG_BRAND_BTN)} onClick={() => void openRecord(r.user_id)}>
                            Open record
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="border-t border-sgvu-navy/10 p-4">
                <PaginationBar total={rows.length} limit={PAGE} offset={offset} onPageChange={setOffset} />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedId} onOpenChange={(o) => !o && setSelectedId(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Student record</DialogTitle>
          </DialogHeader>
          {detailLoading || !detail ? (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (
            <div className="space-y-5">
              <p className="text-sm text-muted-foreground">
                {detail.profile.enrollment_no ?? detail.profile.prn_number ?? '—'} ·{' '}
                {detail.profile.official_email ?? '—'}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ['name', 'Full name'],
                    ['phone', 'Phone'],
                    ['school_name', 'School'],
                    ['department_name', 'Department'],
                    ['program_name', 'Program'],
                    ['degree_name', 'Degree'],
                    ['batch', 'Batch'],
                    ['semester', 'Semester'],
                    ['section_code', 'Section'],
                    ['advisor_name', 'Advisor'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="block space-y-1">
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <Input
                      className="h-10"
                      value={form[key]}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    />
                  </label>
                ))}
                <label className="block space-y-1">
                  <span className="text-xs text-muted-foreground">Lifecycle status</span>
                  <Select
                    value={form.lifecycle_status || undefined}
                    onValueChange={(v) => setForm((f) => ({ ...f, lifecycle_status: v }))}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      {LIFECYCLE.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s.replace(/_/g, ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <label className="block space-y-1 sm:col-span-2">
                  <span className="text-xs text-muted-foreground">Remarks</span>
                  <Input
                    className="h-10"
                    value={form.remarks}
                    onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
                  />
                </label>
              </div>

              <div className="space-y-2 rounded-xl border border-sgvu-navy/10 p-3">
                <p className="text-sm font-semibold text-sgvu-navy">Documents</p>
                {detail.documents.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No documents in vault.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {detail.documents.map((d) => (
                      <li key={d.document_id} className="flex items-center justify-between gap-2">
                        <span>
                          {d.title}{' '}
                          <span className="text-xs text-muted-foreground">({d.category ?? '—'})</span>
                        </span>
                        <a
                          href={d.file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-semibold text-sgvu-navy underline"
                        >
                          Open
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    className="h-9"
                    placeholder="Document title"
                    value={docTitle}
                    onChange={(e) => setDocTitle(e.target.value)}
                  />
                  <Input
                    className="h-9"
                    placeholder="Category"
                    value={docCategory}
                    onChange={(e) => setDocCategory(e.target.value)}
                  />
                  <Input
                    className="h-9 sm:col-span-2"
                    placeholder="File URL or choose a file below"
                    value={docUrl.startsWith('data:') ? '(file attached)' : docUrl}
                    onChange={(e) => setDocUrl(e.target.value)}
                  />
                  <Input
                    type="file"
                    className="h-9 sm:col-span-2"
                    onChange={(e) => onFilePicked(e.target.files?.[0] ?? null)}
                  />
                </div>
                <Button size="sm" variant="outline" onClick={() => void addDocument()}>
                  Add document
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-sgvu-navy/10 p-3">
                  <p className="mb-2 text-sm font-semibold text-sgvu-navy">Lifecycle history</p>
                  <div className="max-h-36 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                    {(detail.lifecycle_history ?? []).slice(0, 8).map((h, i) => (
                      <p key={i}>
                        {h.to_status ?? '—'} · {h.changed_by_name ?? '—'} ·{' '}
                        {h.created_at ? new Date(h.created_at).toLocaleString() : '—'}
                      </p>
                    ))}
                    {(detail.lifecycle_history ?? []).length === 0 ? <p>No history.</p> : null}
                  </div>
                </div>
                <div className="rounded-xl border border-sgvu-navy/10 p-3">
                  <p className="mb-2 text-sm font-semibold text-sgvu-navy">Placement history</p>
                  <div className="max-h-36 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                    {(detail.placement_history ?? []).slice(0, 8).map((h, i) => (
                      <p key={i}>
                        {h.program_name ?? '—'} {h.section_code ? `· ${h.section_code}` : ''} ·{' '}
                        {h.source ?? '—'}
                      </p>
                    ))}
                    {(detail.placement_history ?? []).length === 0 ? <p>No history.</p> : null}
                  </div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedId(null)}>
              Close
            </Button>
            <Button className={cn(REG_BRAND_BTN)} disabled={saving || detailLoading} onClick={() => void saveRecord()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RegistrarDeskChrome>
  );
}
