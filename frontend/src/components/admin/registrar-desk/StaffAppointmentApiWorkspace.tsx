'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  ClipboardCheck,
  FileSignature,
  Loader2,
  Search,
  UserPlus,
} from 'lucide-react';
import {
  REG_BRAND_BTN,
  REG_OUTLINE_BTN,
  RegistrarDeskChrome,
} from '@/components/admin/registrar-desk/RegistrarDeskChrome';
import { REGISTRAR_DESK } from '@/lib/api/api.registrar-desk';
import { useAuthedApi } from '@/lib/api';
import { getApiBaseUrl } from '@/lib/api-base-url';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/lib/notifications/falcon-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { Select } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

type AppointmentRow = {
  appointment_id: string;
  employee_id: string;
  candidate_name: string;
  position: string;
  department?: string;
  joining_date?: string;
  salary_package?: string;
  recruitment_status: string;
  verification_status: string;
  workflow_stage: string;
  reporting_manager?: string;
  email?: string;
  phone?: string;
  salary_json?: Record<string, unknown>;
  checklist_json?: Array<{ label?: string; status?: string }>;
  letter_status: string;
  remarks?: string;
};

type ActivityRow = {
  activity_id: string;
  appointment_id: string;
  event: string;
  actor?: string;
  candidate_name?: string;
  created_at: string;
};

const PAGE = 8;

function fmtDate(v?: string | null) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return v;
  }
}

function fmtSalary(pkg?: string, json?: Record<string, unknown>) {
  if (pkg) return pkg;
  const basic = json?.basic as number | undefined;
  if (basic) return `₹${basic.toLocaleString('en-IN')}`;
  return '—';
}

export function StaffAppointmentApiWorkspace() {
  const api = useAuthedApi();
  const { token } = useAuth();
  const [rows, setRows] = useState<AppointmentRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<AppointmentRow | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<Partial<AppointmentRow>>({});
  const [saving, setSaving] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [rejectRemarks, setRejectRemarks] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [appts, act] = await Promise.all([
        api.get<AppointmentRow[]>(REGISTRAR_DESK.appointments),
        api.get<ActivityRow[]>(REGISTRAR_DESK.appointmentActivity),
      ]);
      setRows(Array.isArray(appts) ? appts : []);
      setActivity(Array.isArray(act) ? act : []);
      setOffset(0);
    } catch (e) {
      toast.error('Could not load appointments', {
        description: e instanceof Error ? e.message : 'Request failed',
      });
      setRows([]);
      setActivity([]);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (stageFilter !== 'all' && r.workflow_stage !== stageFilter && r.verification_status !== stageFilter) {
        if (stageFilter === 'Pending' && r.verification_status !== 'Pending') return false;
        if (stageFilter !== 'Pending' && r.workflow_stage !== stageFilter) return false;
      }
      if (!needle) return true;
      return [r.candidate_name, r.employee_id, r.position, r.department, r.email]
        .some((v) => v?.toLowerCase().includes(needle));
    });
  }, [rows, q, stageFilter]);

  const pageRows = useMemo(() => filtered.slice(offset, offset + PAGE), [filtered, offset]);

  const kpis = useMemo(() => ({
    pendingVerify: rows.filter((r) => r.verification_status === 'Pending').length,
    awaitingSign: rows.filter((r) => r.letter_status === 'DRAFT' && r.verification_status === 'Verified').length,
    issued: rows.filter((r) => r.letter_status === 'ISSUED').length,
    inReview: rows.filter((r) => r.workflow_stage === 'Registrar' && r.recruitment_status !== 'Withdrawn').length,
  }), [rows]);

  function openCreate() {
    setForm({
      employee_id: '',
      candidate_name: '',
      position: '',
      department: '',
      verification_status: 'Pending',
      workflow_stage: 'HR',
      letter_status: 'DRAFT',
      recruitment_status: 'Selected',
    });
    setEditOpen(true);
  }

  function openEdit(row: AppointmentRow) {
    setForm({ ...row });
    setEditOpen(true);
  }

  async function saveAppointment() {
    if (!form.employee_id?.trim() || !form.candidate_name?.trim() || !form.position?.trim()) {
      toast.warning('Employee ID, candidate name, and position are required');
      return;
    }
    setSaving(true);
    try {
      await api.post(REGISTRAR_DESK.appointments, form);
      toast.success(form.appointment_id ? 'Appointment updated' : 'Appointment created');
      setEditOpen(false);
      void load();
    } catch (e) {
      toast.error('Save failed', { description: e instanceof Error ? e.message : 'Error' });
    } finally {
      setSaving(false);
    }
  }

  async function downloadLetter(id: string, candidateName: string) {
    if (!token) return;
    try {
      const res = await fetch(`${getApiBaseUrl()}${REGISTRAR_DESK.appointmentPdf(id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `appointment-letter-${candidateName.replace(/[^\w-]+/g, '_')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error('Could not download letter', {
        description: e instanceof Error ? e.message : 'Request failed',
      });
    }
  }

  async function runAction(id: string, action: 'VERIFY' | 'APPROVE' | 'REJECT' | 'SIGN_ISSUE', remarks?: string) {
    setActionBusy(true);
    try {
      await api.post(REGISTRAR_DESK.appointmentAction(id, action), { remarks });
      toast.success(`${action.replace('_', ' ')} completed`);
      setSelected(null);
      setRejectRemarks('');
      void load();
    } catch (e) {
      toast.error('Action failed', { description: e instanceof Error ? e.message : 'Error' });
    } finally {
      setActionBusy(false);
    }
  }

  function exportCsv() {
    const header = ['Employee ID', 'Candidate', 'Position', 'Department', 'Verification', 'Letter', 'Stage'];
    const body = filtered.map((r) =>
      [r.employee_id, r.candidate_name, r.position, r.department ?? '', r.verification_status, r.letter_status, r.workflow_stage]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(','),
    );
    const blob = new Blob([[header.join(','), ...body].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'staff-appointments.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success('Export downloaded');
  }

  return (
    <RegistrarDeskChrome
      title="Staff Appointments"
      subtitle="Verify documents, review compensation, approve appointments, and digitally sign issue letters."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Awaiting verification', value: kpis.pendingVerify, icon: ClipboardCheck },
          { label: 'Registrar review', value: kpis.inReview, icon: BadgeCheck },
          { label: 'Awaiting signature', value: kpis.awaitingSign, icon: FileSignature },
          { label: 'Letters issued', value: kpis.issued, icon: UserPlus },
        ].map((k) => (
          <Card key={k.label} className="border-sgvu-navy/10 bg-white shadow-sm">
            <CardContent className="flex items-center gap-3 p-4">
              <span className="rounded-xl border border-sgvu-navy/10 p-2">
                <k.icon className="h-5 w-5 text-sgvu-navy" aria-hidden />
              </span>
              <div>
                <p className="text-2xl font-bold tabular-nums text-sgvu-navy">{k.value}</p>
                <p className="text-xs text-muted-foreground">{k.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="grid gap-3 p-4 md:grid-cols-5">
          <label className="md:col-span-2 space-y-1">
            <span className="text-xs text-muted-foreground">Search</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="h-10 pl-9" value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} placeholder="Candidate, employee ID…" />
            </div>
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Stage</span>
            <Select value={stageFilter} onChange={(e) => { setStageFilter(e.target.value); setOffset(0); }} className="h-10">
              <option value="all">All</option>
              <option value="Pending">Pending verification</option>
              <option value="HR">HR</option>
              <option value="Registrar">Registrar</option>
              <option value="Appointment Issued">Issued</option>
            </Select>
          </label>
          <div className="flex items-end gap-2 md:col-span-2">
            <button type="button" className={cn('h-10 rounded-lg px-3 text-sm font-semibold', REG_BRAND_BTN)} onClick={openCreate}>
              New appointment
            </button>
            <button type="button" className={cn('h-10 rounded-lg px-3 text-sm font-semibold', REG_OUTLINE_BTN)} onClick={exportCsv}>
              Export
            </button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardHeader className="border-b border-sgvu-navy/10 pb-3">
          <CardTitle className="text-base font-bold text-sgvu-navy">Appointment register</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">No appointments found.</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table className="min-w-[960px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Candidate</TableHead>
                      <TableHead>Position</TableHead>
                      <TableHead>Verification</TableHead>
                      <TableHead>Letter</TableHead>
                      <TableHead>Stage</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((r) => (
                      <TableRow key={r.appointment_id}>
                        <TableCell>
                          <p className="font-medium text-sgvu-navy">{r.candidate_name}</p>
                          <p className="text-xs text-muted-foreground">{r.employee_id} · {r.department ?? '—'}</p>
                        </TableCell>
                        <TableCell className="text-sm">{r.position}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="border-transparent bg-sgvu-navy/5">{r.verification_status}</Badge>
                        </TableCell>
                        <TableCell>{r.letter_status}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.workflow_stage}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setSelected(r)}>
                              Review
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => openEdit(r)}>
                              Edit
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="border-t border-sgvu-navy/10 p-4">
                <PaginationBar total={filtered.length} limit={PAGE} offset={offset} onPageChange={setOffset} />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardHeader className="border-b border-sgvu-navy/10 pb-3">
          <CardTitle className="text-base font-bold text-sgvu-navy">Activity history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {activity.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No activity recorded yet.</div>
          ) : (
            <div className="divide-y divide-sgvu-navy/5">
              {activity.slice(0, 20).map((a) => (
                <div key={a.activity_id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium text-sgvu-navy">{a.event}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.candidate_name ?? '—'} · {a.actor ?? 'System'}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">{fmtDate(a.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.appointment_id ? 'Edit appointment' : 'New appointment'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1 sm:col-span-1"><span className="text-xs text-muted-foreground">Employee ID</span><Input value={form.employee_id ?? ''} onChange={(e) => setForm({ ...form, employee_id: e.target.value })} /></label>
            <label className="block space-y-1 sm:col-span-1"><span className="text-xs text-muted-foreground">Candidate name</span><Input value={form.candidate_name ?? ''} onChange={(e) => setForm({ ...form, candidate_name: e.target.value })} /></label>
            <label className="block space-y-1 sm:col-span-2"><span className="text-xs text-muted-foreground">Position</span><Input value={form.position ?? ''} onChange={(e) => setForm({ ...form, position: e.target.value })} /></label>
            <label className="block space-y-1"><span className="text-xs text-muted-foreground">Department</span><Input value={form.department ?? ''} onChange={(e) => setForm({ ...form, department: e.target.value })} /></label>
            <label className="block space-y-1"><span className="text-xs text-muted-foreground">Joining date</span><Input type="date" value={form.joining_date?.slice(0, 10) ?? ''} onChange={(e) => setForm({ ...form, joining_date: e.target.value })} /></label>
            <label className="block space-y-1"><span className="text-xs text-muted-foreground">Salary package</span><Input value={form.salary_package ?? ''} onChange={(e) => setForm({ ...form, salary_package: e.target.value })} placeholder="e.g. ₹8,40,000 CTC" /></label>
            <label className="block space-y-1"><span className="text-xs text-muted-foreground">Email</span><Input value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            <label className="block space-y-1"><span className="text-xs text-muted-foreground">Phone</span><Input value={form.phone ?? ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
            <label className="block space-y-1 sm:col-span-2"><span className="text-xs text-muted-foreground">Reporting manager</span><Input value={form.reporting_manager ?? ''} onChange={(e) => setForm({ ...form, reporting_manager: e.target.value })} /></label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button className={REG_BRAND_BTN} disabled={saving} onClick={() => void saveAppointment()}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-sgvu-navy">{selected?.candidate_name}</DialogTitle>
          </DialogHeader>
          {selected ? (
            <div className="space-y-4 text-sm">
              <div className="grid gap-2 sm:grid-cols-2">
                <p><span className="text-muted-foreground">Position:</span> {selected.position}</p>
                <p><span className="text-muted-foreground">Department:</span> {selected.department ?? '—'}</p>
                <p><span className="text-muted-foreground">Joining:</span> {fmtDate(selected.joining_date)}</p>
                <p><span className="text-muted-foreground">Salary:</span> {fmtSalary(selected.salary_package, selected.salary_json)}</p>
                <p><span className="text-muted-foreground">Verification:</span> {selected.verification_status}</p>
                <p><span className="text-muted-foreground">Letter:</span> {selected.letter_status}</p>
              </div>
              {Array.isArray(selected.checklist_json) && selected.checklist_json.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Document checklist</p>
                  <ul className="space-y-1">
                    {selected.checklist_json.map((item, i) => (
                      <li key={i} className="flex justify-between rounded-lg border border-sgvu-navy/10 px-3 py-2">
                        <span>{item.label ?? `Item ${i + 1}`}</span>
                        <Badge variant="outline">{item.status ?? 'Pending'}</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-muted-foreground">No checklist items on file.</p>
              )}
              {selected.remarks ? (
                <p className="rounded-lg border border-sgvu-navy/10 bg-slate-50/80 p-3 text-muted-foreground">{selected.remarks}</p>
              ) : null}
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">Rejection remarks (optional)</span>
                <Input value={rejectRemarks} onChange={(e) => setRejectRemarks(e.target.value)} placeholder="Reason if rejecting…" />
              </label>
            </div>
          ) : null}
          <DialogFooter className="flex-wrap gap-2">
            {selected?.verification_status === 'Pending' ? (
              <Button className={REG_BRAND_BTN} disabled={actionBusy} onClick={() => void runAction(selected!.appointment_id, 'VERIFY')}>
                Verify documents
              </Button>
            ) : null}
            {selected &&
            selected.verification_status === 'Verified' &&
            selected.recruitment_status !== 'Offer Extended' &&
            selected.letter_status !== 'ISSUED' ? (
              <Button className={REG_BRAND_BTN} disabled={actionBusy} onClick={() => void runAction(selected.appointment_id, 'APPROVE')}>
                Approve
              </Button>
            ) : null}
            {selected &&
            selected.verification_status === 'Verified' &&
            selected.recruitment_status === 'Offer Extended' &&
            selected.letter_status !== 'ISSUED' ? (
              <Button
                variant="outline"
                disabled={actionBusy}
                onClick={() => void runAction(selected.appointment_id, 'SIGN_ISSUE')}
              >
                Sign &amp; issue letter
              </Button>
            ) : null}
            {selected?.letter_status === 'ISSUED' ? (
              <Button
                variant="outline"
                disabled={actionBusy}
                onClick={() => void downloadLetter(selected.appointment_id, selected.candidate_name)}
              >
                Download letter PDF
              </Button>
            ) : null}
            {selected && selected.recruitment_status !== 'Withdrawn' ? (
              <Button variant="outline" className="text-red-700" disabled={actionBusy} onClick={() => void runAction(selected.appointment_id, 'REJECT', rejectRemarks)}>
                Reject
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => setSelected(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RegistrarDeskChrome>
  );
}
