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
import { getApiBaseUrl } from '@/lib/api-base-url';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/lib/notifications/falcon-toast';
import { cn } from '@/lib/utils';

const CERT_TYPES = [
  'TRANSCRIPT',
  'BONAFIDE',
  'MIGRATION',
  'PROVISIONAL',
  'DUPLICATE_DEGREE',
  'CHARACTER',
  'DEGREE',
  'TRANSFER',
] as const;

type CertRow = {
  request_id: string;
  student_user_id: string;
  student_name?: string;
  enrollment_no?: string;
  certificate_type: string;
  status: string;
  remarks?: string;
  pdf_url?: string;
  issued_at?: string;
  signed_at?: string;
  created_at?: string;
};

type StudentOpt = { user_id: string; name: string; enrollment_no?: string };

const PAGE = 10;

export function CertificateDeskWorkspace() {
  const api = useAuthedApi();
  const { token } = useAuth();
  const [rows, setRows] = useState<CertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');
  const [status, setStatus] = useState('all');
  const [offset, setOffset] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [students, setStudents] = useState<StudentOpt[]>([]);
  const [studentId, setStudentId] = useState('');
  const [newType, setNewType] = useState<string>(CERT_TYPES[0]);
  const [preview, setPreview] = useState<CertRow | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (type !== 'all') params.set('type', type);
      if (status !== 'all') params.set('status', status);
      const data = await api.get<CertRow[]>(`${REGISTRAR_DESK.certificates}?${params}`);
      setRows(Array.isArray(data) ? data : []);
      setOffset(0);
    } catch (e) {
      toast.error('Could not load certificates', {
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
    try {
      const data = await api.get<{ rows: StudentOpt[] }>(
        `${REGISTRAR_DESK.placementStudents}?limit=100&offset=0`,
      );
      setStudents(data.rows ?? []);
      if (data.rows?.[0]) setStudentId(data.rows[0].user_id);
    } catch {
      setStudents([]);
    }
  }

  async function createRequest() {
    if (!studentId) {
      toast.warning('Select a student');
      return;
    }
    setSaving(true);
    try {
      await api.post(REGISTRAR_DESK.certificates, {
        student_user_id: studentId,
        certificate_type: newType,
      });
      toast.success('Certificate request created');
      setCreateOpen(false);
      void load();
    } catch (e) {
      toast.error('Create failed', { description: e instanceof Error ? e.message : 'Error' });
    } finally {
      setSaving(false);
    }
  }

  async function act(row: CertRow, action: string) {
    try {
      await api.post(REGISTRAR_DESK.certificateAction(row.request_id, action), {});
      toast.success(`${action} completed`);
      void load();
    } catch (e) {
      toast.error(`${action} failed`, { description: e instanceof Error ? e.message : 'Error' });
    }
  }

  async function downloadCertificatePdf(row: CertRow) {
    if (!token) {
      toast.warning('Sign in again to download certificates');
      return;
    }
    try {
      const response = await fetch(`${getApiBaseUrl()}${REGISTRAR_DESK.certificatePdf(row.request_id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const disposition = response.headers.get('Content-Disposition') ?? '';
      const match = /filename="?([^"]+)"?/i.exec(disposition);
      const filename =
        match?.[1] ??
        `${row.certificate_type.toLowerCase()}-${(row.enrollment_no ?? row.request_id).slice(0, 12)}.pdf`;
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('PDF downloaded');
    } catch (e) {
      toast.error('Could not download certificate PDF', {
        description: e instanceof Error ? e.message : 'Request failed',
      });
    }
  }

  function exportCsv() {
    const header = ['Student', 'Enrollment', 'Type', 'Status', 'Issued', 'Signed'];
    const body = rows.map((r) =>
      [
        r.student_name ?? '',
        r.enrollment_no ?? '',
        r.certificate_type,
        r.status,
        r.issued_at ?? '',
        r.signed_at ?? '',
      ]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(','),
    );
    const blob = new Blob([[header.join(','), ...body].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'certificate-desk.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <RegistrarDeskChrome
      title="Certificate Desk"
      subtitle="Generate, preview, digitally sign, and issue transcripts and university certificates."
    >
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="grid gap-3 p-4 md:grid-cols-5">
          <label className="md:col-span-2 space-y-1">
            <span className="text-xs text-muted-foreground">Search</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="h-10 pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Student or enrollment…" />
            </div>
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Type</span>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {CERT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Status</span>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="GENERATED">Generated</SelectItem>
                <SelectItem value="SIGNED">Signed</SelectItem>
                <SelectItem value="ISSUED">Issued</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <div className="flex items-end gap-2">
            <button type="button" className={cn('h-10 rounded-lg px-3 text-sm font-semibold', REG_BRAND_BTN)} onClick={() => void openCreate()}>
              New request
            </button>
            <button type="button" className={cn('h-10 rounded-lg px-3 text-sm font-semibold', REG_OUTLINE_BTN)} onClick={exportCsv}>
              Export
            </button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardHeader className="border-b border-sgvu-navy/10 pb-3">
          <CardTitle className="text-base font-bold text-sgvu-navy">Issue history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">No certificate requests yet.</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table className="min-w-[900px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Issued</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((r) => (
                      <TableRow key={r.request_id}>
                        <TableCell>
                          <p className="font-medium text-sgvu-navy">{r.student_name}</p>
                          <p className="text-xs text-muted-foreground">{r.enrollment_no ?? '—'}</p>
                        </TableCell>
                        <TableCell>{r.certificate_type.replace(/_/g, ' ')}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="border-transparent bg-sgvu-navy/5 text-sgvu-navy">
                            {r.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.issued_at ? new Date(r.issued_at).toLocaleString() : '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setPreview(r)}>
                              Preview
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => void downloadCertificatePdf(r)}>
                              PDF
                            </Button>
                            {r.status === 'DRAFT' || r.status === 'REJECTED' ? (
                              <Button size="sm" className={cn('h-7 text-[11px]', REG_BRAND_BTN)} onClick={() => void act(r, 'generate')}>
                                Generate
                              </Button>
                            ) : null}
                            {r.status === 'GENERATED' ? (
                              <Button size="sm" className={cn('h-7 text-[11px]', REG_BRAND_BTN)} onClick={() => void act(r, 'sign')}>
                                Attest &amp; sign
                              </Button>
                            ) : null}
                            {r.status === 'SIGNED' ? (
                              <Button size="sm" className={cn('h-7 text-[11px]', REG_BRAND_BTN)} onClick={() => void act(r, 'issue')}>
                                Issue
                              </Button>
                            ) : null}
                            {r.status === 'DRAFT' || r.status === 'GENERATED' ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[11px] text-red-700"
                                onClick={() => void act(r, 'reject')}
                              >
                                Reject
                              </Button>
                            ) : null}
                          </div>
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New certificate request</DialogTitle>
          </DialogHeader>
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">Student</span>
            <Select value={studentId || undefined} onValueChange={setStudentId}>
              <SelectTrigger className="h-10"><SelectValue placeholder="Select student" /></SelectTrigger>
              <SelectContent>
                {students.map((s) => (
                  <SelectItem key={s.user_id} value={s.user_id}>
                    {s.name} {s.enrollment_no ? `(${s.enrollment_no})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">Certificate type</span>
            <Select value={newType} onValueChange={setNewType}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CERT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button className={REG_BRAND_BTN} disabled={saving} onClick={() => void createRequest()}>
              {saving ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{preview?.certificate_type.replace(/_/g, ' ')}</DialogTitle>
          </DialogHeader>
          {preview ? (
            <div className="space-y-2 rounded-xl border border-sgvu-navy/10 bg-slate-50/80 p-4 text-sm">
              <p><span className="text-muted-foreground">Student:</span> {preview.student_name}</p>
              <p><span className="text-muted-foreground">Enrollment:</span> {preview.enrollment_no ?? '—'}</p>
              <p><span className="text-muted-foreground">Status:</span> {preview.status}</p>
              <p><span className="text-muted-foreground">Remarks:</span> {preview.remarks || '—'}</p>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => preview && void downloadCertificatePdf(preview)}>Download PDF</Button>
            <Button className={REG_BRAND_BTN} onClick={() => setPreview(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RegistrarDeskChrome>
  );
}
