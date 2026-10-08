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
import { Textarea } from '@/components/ui/textarea';
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

const PETITION_TYPES = [
  'TRANSFER_CERTIFICATE',
  'NAME_CORRECTION',
  'COURSE_CHANGE',
  'MIGRATION_CERTIFICATE',
] as const;

type PetitionAttachment = {
  name?: string;
  data_url?: string;
  file_url?: string;
  url?: string;
  size?: number;
};

type PetitionRow = {
  petition_id: string;
  petition_type: string;
  student_user_id?: string;
  student_name: string;
  enrollment_no?: string;
  current_value?: string;
  requested_value: string;
  reason?: string;
  status: string;
  registrar_remarks?: string;
  certificate_request_id?: string | null;
  documents_json?: PetitionAttachment[] | string | null;
  decided_at?: string;
  created_at?: string;
  updated_at?: string;
};

function parsePetitionDocs(raw: PetitionRow['documents_json']): PetitionAttachment[] {
  if (!raw) return [];
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value.filter((d): d is PetitionAttachment => !!d && typeof d === 'object');
}

function attachmentHref(doc: PetitionAttachment): string | null {
  const href = doc.data_url || doc.file_url || doc.url;
  return typeof href === 'string' && href.length > 0 ? href : null;
}

type StudentOpt = { user_id: string; name: string; enrollment_no?: string };

type DecideAction = 'APPROVED' | 'REJECTED' | 'ISSUED';

const PAGE = 10;

export function AcademicPetitionsWorkspace() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<PetitionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');
  const [status, setStatus] = useState('all');
  const [offset, setOffset] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [students, setStudents] = useState<StudentOpt[]>([]);
  const [saving, setSaving] = useState(false);
  const [decide, setDecide] = useState<{ row: PetitionRow; action: DecideAction } | null>(null);
  const [remarks, setRemarks] = useState('');
  const [form, setForm] = useState({
    petition_type: PETITION_TYPES[0] as string,
    student_user_id: '',
    student_name: '',
    enrollment_no: '',
    current_value: '',
    requested_value: '',
    reason: '',
  });
  const [attachments, setAttachments] = useState<
    Array<{ name: string; data_url: string; size: number }>
  >([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (type !== 'all') params.set('type', type);
      if (status !== 'all') params.set('status', status);
      const data = await api.get<PetitionRow[]>(`${REGISTRAR_DESK.petitions}?${params}`);
      setRows(Array.isArray(data) ? data : []);
      setOffset(0);
    } catch (e) {
      toast.error('Could not load petitions', {
        description: e instanceof Error ? e.message : 'Request failed',
      });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [api, q, type, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const pageRows = useMemo(() => rows.slice(offset, offset + PAGE), [rows, offset]);

  async function openCreate() {
    setCreateOpen(true);
    setForm({
      petition_type: PETITION_TYPES[0],
      student_user_id: '',
      student_name: '',
      enrollment_no: '',
      current_value: '',
      requested_value: '',
      reason: '',
    });
    try {
      const data = await api.get<{ rows: StudentOpt[] }>(
        `${REGISTRAR_DESK.placementStudents}?limit=100&offset=0`,
      );
      const list = data.rows ?? [];
      setStudents(list);
      if (list[0]) {
        setForm((f) => ({
          ...f,
          student_user_id: list[0].user_id,
          student_name: list[0].name,
          enrollment_no: list[0].enrollment_no ?? '',
        }));
      }
    } catch {
      setStudents([]);
    }
  }

  function onStudentPick(userId: string) {
    const s = students.find((x) => x.user_id === userId);
    setForm((f) => ({
      ...f,
      student_user_id: userId,
      student_name: s?.name ?? f.student_name,
      enrollment_no: s?.enrollment_no ?? f.enrollment_no,
    }));
  }

  async function createPetition() {
    if (!form.student_name.trim() || !form.requested_value.trim()) {
      toast.warning('Student name and requested value are required');
      return;
    }
    setSaving(true);
    try {
      await api.post(REGISTRAR_DESK.petitions, {
        petition_type: form.petition_type,
        student_user_id: form.student_user_id || undefined,
        student_name: form.student_name.trim(),
        enrollment_no: form.enrollment_no.trim() || undefined,
        current_value: form.current_value.trim() || undefined,
        requested_value: form.requested_value.trim(),
        reason: form.reason.trim() || undefined,
        documents_json: attachments.map((a) => ({
          name: a.name,
          size: a.size,
          data_url: a.data_url,
        })),
      });
      toast.success('Petition created');
      setAttachments([]);
      setCreateOpen(false);
      void load();
    } catch (e) {
      toast.error('Create failed', { description: e instanceof Error ? e.message : 'Error' });
    } finally {
      setSaving(false);
    }
  }

  async function submitDecide() {
    if (!decide) return;
    setSaving(true);
    try {
      const result = await api.post<{ certificate_request_id?: string | null }>(
        REGISTRAR_DESK.petitionDecide(decide.row.petition_id),
        {
          status: decide.action,
          remarks: remarks.trim() || undefined,
        },
      );
      const certLinked =
        !!result?.certificate_request_id &&
        ['TRANSFER_CERTIFICATE', 'MIGRATION_CERTIFICATE'].includes(decide.row.petition_type);
      toast.success(
        decide.action === 'REJECTED'
          ? 'Petition rejected'
          : certLinked
            ? 'Petition approved — certificate draft created in Certificate Desk'
            : decide.action === 'APPROVED'
              ? 'Petition approved'
              : 'Certificate issued',
      );
      setDecide(null);
      setRemarks('');
      void load();
    } catch (e) {
      toast.error('Action failed', { description: e instanceof Error ? e.message : 'Error' });
    } finally {
      setSaving(false);
    }
  }

  function exportCsv() {
    const header = [
      'Student',
      'Enrollment',
      'Type',
      'Current',
      'Requested',
      'Status',
      'Updated',
    ];
    const body = rows.map((r) =>
      [
        r.student_name,
        r.enrollment_no ?? '',
        r.petition_type,
        r.current_value ?? '',
        r.requested_value,
        r.status,
        r.updated_at ?? '',
      ]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(','),
    );
    const blob = new Blob([[header.join(','), ...body].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'academic-petitions.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function statusBadgeClass(s: string) {
    if (s === 'APPROVED' || s === 'ISSUED') return 'bg-emerald-50 text-emerald-700';
    if (s === 'REJECTED') return 'bg-red-50 text-red-700';
    return 'bg-amber-50 text-amber-700';
  }

  const canIssue = (row: PetitionRow) =>
    ['TRANSFER_CERTIFICATE', 'MIGRATION_CERTIFICATE'].includes(row.petition_type) &&
    (row.status === 'PENDING' || row.status === 'APPROVED');

  return (
    <RegistrarDeskChrome
      title="Academic Petitions"
      subtitle="Process transfer certificates, name corrections, course changes, and migration certificate requests."
    >
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="grid gap-3 p-4 md:grid-cols-5">
          <label className="md:col-span-2 space-y-1">
            <span className="text-xs text-muted-foreground">Search</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-10 pl-9"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Student or enrollment…"
              />
            </div>
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Type</span>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {PETITION_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t.replace(/_/g, ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Status</span>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
                <SelectItem value="ISSUED">Issued</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <div className="flex items-end gap-2">
            <button
              type="button"
              className={cn('h-10 rounded-lg px-3 text-sm font-semibold', REG_BRAND_BTN)}
              onClick={() => void openCreate()}
            >
              New petition
            </button>
            <button
              type="button"
              className={cn('h-10 rounded-lg px-3 text-sm font-semibold', REG_OUTLINE_BTN)}
              onClick={exportCsv}
            >
              Export
            </button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardHeader className="border-b border-sgvu-navy/10 pb-3">
          <CardTitle className="text-base font-bold text-sgvu-navy">Petition queue</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">No petitions found.</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table className="min-w-[960px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Request</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Updated</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((r) => {
                      const attachmentCount = parsePetitionDocs(r.documents_json).length;
                      return (
                      <TableRow key={r.petition_id}>
                        <TableCell>
                          <p className="font-medium text-sgvu-navy">{r.student_name}</p>
                          <p className="text-xs text-muted-foreground">{r.enrollment_no ?? '—'}</p>
                          {attachmentCount ? (
                            <p className="mt-1 text-[11px] font-medium text-sgvu-navy/70">
                              {attachmentCount} attachment{attachmentCount === 1 ? '' : 's'}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell>{r.petition_type.replace(/_/g, ' ')}</TableCell>
                        <TableCell className="max-w-[220px] text-sm">
                          {r.current_value ? (
                            <span className="text-muted-foreground line-through">{r.current_value}</span>
                          ) : null}
                          {r.current_value ? ' → ' : null}
                          <span className="font-medium">{r.requested_value}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('border-transparent', statusBadgeClass(r.status))}>
                            {r.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.updated_at ? new Date(r.updated_at).toLocaleString() : '—'}
                        </TableCell>
                        <TableCell>
                          {r.status === 'PENDING' ? (
                            <div className="flex flex-wrap gap-1">
                              <Button
                                size="sm"
                                className={cn('h-7 text-[11px]', REG_BRAND_BTN)}
                                onClick={() => {
                                  setDecide({ row: r, action: 'APPROVED' });
                                  setRemarks('');
                                }}
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[11px]"
                                onClick={() => {
                                  setDecide({ row: r, action: 'REJECTED' });
                                  setRemarks('');
                                }}
                              >
                                Reject
                              </Button>
                              {canIssue(r) ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-[11px]"
                                  onClick={() => {
                                    setDecide({ row: r, action: 'ISSUED' });
                                    setRemarks('');
                                  }}
                                >
                                  Issue
                                </Button>
                              ) : null}
                            </div>
                          ) : canIssue(r) && r.status === 'APPROVED' ? (
                            <Button
                              size="sm"
                              className={cn('h-7 text-[11px]', REG_BRAND_BTN)}
                              onClick={() => {
                                setDecide({ row: r, action: 'ISSUED' });
                                setRemarks('');
                              }}
                            >
                              Issue
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                    })}
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New academic petition</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">Petition type</span>
              <Select
                value={form.petition_type}
                onValueChange={(v) => setForm((f) => ({ ...f, petition_type: v }))}
              >
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PETITION_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            {students.length > 0 ? (
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">Student (optional link)</span>
                <Select value={form.student_user_id || undefined} onValueChange={onStudentPick}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Select student" />
                  </SelectTrigger>
                  <SelectContent>
                    {students.map((s) => (
                      <SelectItem key={s.user_id} value={s.user_id}>
                        {s.name} {s.enrollment_no ? `(${s.enrollment_no})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            ) : null}
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">Student name</span>
              <Input
                className="h-10"
                value={form.student_name}
                onChange={(e) => setForm((f) => ({ ...f, student_name: e.target.value }))}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">Enrollment no</span>
              <Input
                className="h-10"
                value={form.enrollment_no}
                onChange={(e) => setForm((f) => ({ ...f, enrollment_no: e.target.value }))}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">Current value</span>
              <Input
                className="h-10"
                value={form.current_value}
                onChange={(e) => setForm((f) => ({ ...f, current_value: e.target.value }))}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">Requested value</span>
              <Input
                className="h-10"
                value={form.requested_value}
                onChange={(e) => setForm((f) => ({ ...f, requested_value: e.target.value }))}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">Reason</span>
              <Textarea
                rows={2}
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">Attachments (optional, max 2 MB each)</span>
              <Input
                type="file"
                className="h-10"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  files.forEach((file) => {
                    if (file.size > 2_500_000) {
                      toast.warning(`${file.name} is too large (max 2.5 MB)`);
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                      setAttachments((prev) => [
                        ...prev,
                        {
                          name: file.name,
                          size: file.size,
                          data_url: String(reader.result ?? ''),
                        },
                      ]);
                    };
                    reader.readAsDataURL(file);
                  });
                  e.target.value = '';
                }}
              />
              {attachments.length ? (
                <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                  {attachments.map((a) => (
                    <li key={`${a.name}-${a.size}`} className="flex items-center justify-between gap-2">
                      <span className="truncate">{a.name}</span>
                      <button
                        type="button"
                        className="font-semibold text-sgvu-navy"
                        onClick={() =>
                          setAttachments((prev) => prev.filter((x) => x.data_url !== a.data_url))
                        }
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button className={REG_BRAND_BTN} disabled={saving} onClick={() => void createPetition()}>
              {saving ? 'Creating…' : 'Submit petition'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!decide} onOpenChange={(o) => !o && setDecide(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decide?.action === 'APPROVED'
                ? 'Approve petition'
                : decide?.action === 'REJECTED'
                  ? 'Reject petition'
                  : 'Issue certificate'}
            </DialogTitle>
          </DialogHeader>
          {decide ? (
            <div className="space-y-3 text-sm">
              <p>
                <span className="text-muted-foreground">Student:</span> {decide.row.student_name}
              </p>
              <p>
                <span className="text-muted-foreground">Type:</span>{' '}
                {decide.row.petition_type.replace(/_/g, ' ')}
              </p>
              <p>
                <span className="text-muted-foreground">Request:</span> {decide.row.requested_value}
              </p>
              {decide.row.reason ? (
                <p>
                  <span className="text-muted-foreground">Reason:</span> {decide.row.reason}
                </p>
              ) : null}
              {(() => {
                const docs = parsePetitionDocs(decide.row.documents_json);
                if (!docs.length) {
                  return (
                    <p className="rounded-lg border border-dashed border-sgvu-navy/15 bg-slate-50/80 px-3 py-2 text-xs text-muted-foreground">
                      No supporting attachments on this petition.
                    </p>
                  );
                }
                return (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-sgvu-navy">Supporting attachments</p>
                    <ul className="space-y-1">
                      {docs.map((doc, i) => {
                        const href = attachmentHref(doc);
                        const label = doc.name || `Attachment ${i + 1}`;
                        return (
                          <li key={`${label}-${i}`}>
                            {href ? (
                              <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm font-medium text-sgvu-navy underline-offset-2 hover:underline"
                              >
                                {label}
                              </a>
                            ) : (
                              <span className="text-sm text-muted-foreground">{label}</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })()}
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">Registrar remarks</span>
                <Textarea rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
              </label>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecide(null)}>
              Cancel
            </Button>
            <Button
              className={decide?.action === 'REJECTED' ? undefined : REG_BRAND_BTN}
              variant={decide?.action === 'REJECTED' ? 'destructive' : 'default'}
              disabled={saving}
              onClick={() => void submitDecide()}
            >
              {saving ? 'Saving…' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RegistrarDeskChrome>
  );
}
