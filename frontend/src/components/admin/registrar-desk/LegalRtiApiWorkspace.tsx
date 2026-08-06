'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  FileText,
  Gavel,
  Loader2,
  Printer,
  Scale,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import {
  REG_BRAND_BTN,
  REG_OUTLINE_BTN,
  RegistrarDeskChrome,
} from '@/components/admin/registrar-desk/RegistrarDeskChrome';
import { REGISTRAR_DESK } from '@/lib/api/api.registrar-desk';
import { useAuthedApi } from '@/lib/api';
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

type Tab = 'rti' | 'court' | 'notices' | 'disciplinary' | 'compliance';

type RtiRow = {
  rti_id: string;
  reference_no: string;
  applicant_name: string;
  subject: string;
  department?: string;
  status: string;
  due_date?: string;
  assigned_to?: string;
  reply_summary?: string;
};

type CourtRow = {
  case_id: string;
  case_number: string;
  title: string;
  court_name?: string;
  status: string;
  next_hearing?: string;
  counsel?: string;
};

type NoticeRow = {
  notice_id: string;
  notice_number: string;
  title: string;
  party?: string;
  status: string;
  due_date?: string;
};

type DisciplinaryRow = {
  case_id: string;
  case_number: string;
  student_name?: string;
  allegation: string;
  status: string;
  committee?: string;
};

type ComplianceSummary = {
  rti_open: number;
  rti_due_soon: number;
  court_active: number;
  notices_open: number;
  disciplinary_open: number;
};

const PAGE = 8;
const TABLE_HEAD =
  'h-11 border-b border-sgvu-navy/10 bg-white px-4 text-left align-middle text-xs font-semibold normal-case text-sgvu-navy/70';
const CELL = 'px-4 py-3.5 align-middle text-sm text-sgvu-navy';

const TABS: { id: Tab; label: string }[] = [
  { id: 'rti', label: 'RTI Requests' },
  { id: 'court', label: 'Court Cases' },
  { id: 'notices', label: 'Legal Notices' },
  { id: 'disciplinary', label: 'Committee / Disciplinary' },
  { id: 'compliance', label: 'Compliance' },
];

function fmtDate(v?: string | null) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return v;
  }
}

function dueSoon(d?: string | null) {
  if (!d) return false;
  const diff = (new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= 7;
}

function exportCsv(filename: string, header: string[], rows: string[][]) {
  const body = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','));
  const blob = new Blob([[header.join(','), ...body].join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function printTable(title: string, headers: string[], rows: string[][]) {
  const html = `<!DOCTYPE html><html><head><title>${title}</title>
    <style>body{font-family:system-ui,sans-serif;padding:32px;color:#0B2447}
    h1{font-size:20px} table{width:100%;border-collapse:collapse;margin-top:16px;font-size:12px}
    th,td{border:1px solid #ccc;padding:8px;text-align:left} th{background:#f5f5f5}</style></head>
    <body><h1>${title}</h1><p>Generated ${new Date().toLocaleString()}</p>
    <table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>
    <script>window.print()</script></body></html>`;
  const w = window.open('', '_blank');
  if (!w) {
    toast.warning('Allow pop-ups to print');
    return;
  }
  w.document.write(html);
  w.document.close();
}

export function LegalRtiApiWorkspace() {
  const api = useAuthedApi();
  const [tab, setTab] = useState<Tab>('rti');
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [offset, setOffset] = useState(0);

  const [rti, setRti] = useState<RtiRow[]>([]);
  const [court, setCourt] = useState<CourtRow[]>([]);
  const [notices, setNotices] = useState<NoticeRow[]>([]);
  const [disciplinary, setDisciplinary] = useState<DisciplinaryRow[]>([]);
  const [compliance, setCompliance] = useState<ComplianceSummary | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editRti, setEditRti] = useState<Partial<RtiRow> | null>(null);
  const [editCourt, setEditCourt] = useState<Partial<CourtRow> | null>(null);
  const [editNotice, setEditNotice] = useState<Partial<NoticeRow> | null>(null);
  const [editDisc, setEditDisc] = useState<Partial<DisciplinaryRow> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rtiData, courtData, noticeData, discData, compData] = await Promise.all([
        api.get<RtiRow[]>(REGISTRAR_DESK.legalRti),
        api.get<CourtRow[]>(REGISTRAR_DESK.legalCourt),
        api.get<NoticeRow[]>(REGISTRAR_DESK.legalNotices),
        api.get<DisciplinaryRow[]>(REGISTRAR_DESK.legalDisciplinary),
        api.get<ComplianceSummary>(REGISTRAR_DESK.legalCompliance),
      ]);
      setRti(Array.isArray(rtiData) ? rtiData : []);
      setCourt(Array.isArray(courtData) ? courtData : []);
      setNotices(Array.isArray(noticeData) ? noticeData : []);
      setDisciplinary(Array.isArray(discData) ? discData : []);
      setCompliance(compData ?? null);
      setOffset(0);
    } catch (e) {
      toast.error('Could not load legal workspace', {
        description: e instanceof Error ? e.message : 'Request failed',
      });
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredRti = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rti.filter((r) => {
      if (statusFilter !== 'all' && r.status.toUpperCase() !== statusFilter.toUpperCase()) return false;
      if (!needle) return true;
      return [r.reference_no, r.applicant_name, r.subject, r.department]
        .some((v) => v?.toLowerCase().includes(needle));
    });
  }, [rti, q, statusFilter]);

  const filteredCourt = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return court.filter((r) => {
      if (statusFilter !== 'all' && r.status.toUpperCase() !== statusFilter.toUpperCase()) return false;
      if (!needle) return true;
      return [r.case_number, r.title, r.court_name, r.counsel].some((v) => v?.toLowerCase().includes(needle));
    });
  }, [court, q, statusFilter]);

  const filteredNotices = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return notices.filter((r) => {
      if (statusFilter !== 'all' && r.status.toUpperCase() !== statusFilter.toUpperCase()) return false;
      if (!needle) return true;
      return [r.notice_number, r.title, r.party].some((v) => v?.toLowerCase().includes(needle));
    });
  }, [notices, q, statusFilter]);

  const filteredDisc = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return disciplinary.filter((r) => {
      if (statusFilter !== 'all' && r.status.toUpperCase() !== statusFilter.toUpperCase()) return false;
      if (!needle) return true;
      return [r.case_number, r.student_name, r.allegation, r.committee].some((v) =>
        v?.toLowerCase().includes(needle),
      );
    });
  }, [disciplinary, q, statusFilter]);

  const activeRows = useMemo(() => {
    if (tab === 'rti') return filteredRti;
    if (tab === 'court') return filteredCourt;
    if (tab === 'notices') return filteredNotices;
    if (tab === 'disciplinary') return filteredDisc;
    return [];
  }, [tab, filteredRti, filteredCourt, filteredNotices, filteredDisc]);

  const pageRows = useMemo(() => activeRows.slice(offset, offset + PAGE), [activeRows, offset]);

  function openCreate() {
    if (tab === 'rti') setEditRti({ status: 'OPEN' });
    else if (tab === 'court') setEditCourt({ status: 'ACTIVE' });
    else if (tab === 'notices') setEditNotice({ status: 'OPEN' });
    else if (tab === 'disciplinary') setEditDisc({ status: 'OPEN' });
    else return;
    setDialogOpen(true);
  }

  async function saveRecord() {
    setSaving(true);
    try {
      if (editRti) {
        if (!editRti.reference_no?.trim() || !editRti.applicant_name?.trim() || !editRti.subject?.trim()) {
          toast.warning('Fill reference, applicant, and subject');
          return;
        }
        await api.post(REGISTRAR_DESK.legalRti, editRti);
        toast.success(editRti.rti_id ? 'RTI updated' : 'RTI registered');
      } else if (editCourt) {
        if (!editCourt.case_number?.trim() || !editCourt.title?.trim()) {
          toast.warning('Fill case number and title');
          return;
        }
        await api.post(REGISTRAR_DESK.legalCourt, editCourt);
        toast.success(editCourt.case_id ? 'Court case updated' : 'Court case registered');
      } else if (editNotice) {
        if (!editNotice.notice_number?.trim() || !editNotice.title?.trim()) {
          toast.warning('Fill notice number and title');
          return;
        }
        await api.post(REGISTRAR_DESK.legalNotices, editNotice);
        toast.success(editNotice.notice_id ? 'Notice updated' : 'Notice added');
      } else if (editDisc) {
        if (!editDisc.case_number?.trim() || !editDisc.allegation?.trim()) {
          toast.warning('Fill case number and allegation');
          return;
        }
        await api.post(REGISTRAR_DESK.legalDisciplinary, editDisc);
        toast.success(editDisc.case_id ? 'Case updated' : 'Case created');
      }
      setDialogOpen(false);
      setEditRti(null);
      setEditCourt(null);
      setEditNotice(null);
      setEditDisc(null);
      void load();
    } catch (e) {
      toast.error('Save failed', { description: e instanceof Error ? e.message : 'Error' });
    } finally {
      setSaving(false);
    }
  }

  function handleExport() {
    if (tab === 'rti') {
      exportCsv(
        'rti-register.csv',
        ['Reference', 'Applicant', 'Subject', 'Department', 'Status', 'Due date'],
        filteredRti.map((r) => [
          r.reference_no,
          r.applicant_name,
          r.subject,
          r.department ?? '',
          r.status,
          fmtDate(r.due_date),
        ]),
      );
    } else if (tab === 'court') {
      exportCsv(
        'court-cases.csv',
        ['Case no.', 'Title', 'Court', 'Status', 'Next hearing', 'Counsel'],
        filteredCourt.map((r) => [
          r.case_number,
          r.title,
          r.court_name ?? '',
          r.status,
          fmtDate(r.next_hearing),
          r.counsel ?? '',
        ]),
      );
    } else if (tab === 'notices') {
      exportCsv(
        'legal-notices.csv',
        ['Notice no.', 'Title', 'Party', 'Status', 'Due date'],
        filteredNotices.map((r) => [
          r.notice_number,
          r.title,
          r.party ?? '',
          r.status,
          fmtDate(r.due_date),
        ]),
      );
    } else if (tab === 'disciplinary') {
      exportCsv(
        'disciplinary-cases.csv',
        ['Case no.', 'Student', 'Allegation', 'Committee', 'Status'],
        filteredDisc.map((r) => [
          r.case_number,
          r.student_name ?? '',
          r.allegation,
          r.committee ?? '',
          r.status,
        ]),
      );
    } else if (compliance) {
      exportCsv(
        'legal-compliance.csv',
        ['Metric', 'Count'],
        [
          ['RTI open', String(compliance.rti_open)],
          ['RTI due within 7 days', String(compliance.rti_due_soon)],
          ['Active court cases', String(compliance.court_active)],
          ['Open notices', String(compliance.notices_open)],
          ['Open disciplinary cases', String(compliance.disciplinary_open)],
        ],
      );
    }
    toast.success('Export downloaded');
  }

  function handlePrint() {
    if (tab === 'rti') {
      printTable(
        'RTI Register',
        ['Reference', 'Applicant', 'Subject', 'Status', 'Due'],
        filteredRti.map((r) => [r.reference_no, r.applicant_name, r.subject, r.status, fmtDate(r.due_date)]),
      );
    } else if (tab === 'court') {
      printTable(
        'Court Cases',
        ['Case no.', 'Title', 'Court', 'Status'],
        filteredCourt.map((r) => [r.case_number, r.title, r.court_name ?? '—', r.status]),
      );
    } else if (tab === 'notices') {
      printTable(
        'Legal Notices',
        ['Notice no.', 'Title', 'Party', 'Status'],
        filteredNotices.map((r) => [r.notice_number, r.title, r.party ?? '—', r.status]),
      );
    } else if (tab === 'disciplinary') {
      printTable(
        'Disciplinary Cases',
        ['Case no.', 'Student', 'Status'],
        filteredDisc.map((r) => [r.case_number, r.student_name ?? '—', r.status]),
      );
    }
  }

  const kpis = [
    { label: 'RTI open', value: compliance?.rti_open ?? 0, icon: FileText, tone: 'text-blue-600' },
    { label: 'RTI due soon', value: compliance?.rti_due_soon ?? 0, icon: CalendarClock, tone: 'text-amber-600' },
    { label: 'Court active', value: compliance?.court_active ?? 0, icon: Gavel, tone: 'text-sgvu-navy' },
    { label: 'Notices open', value: compliance?.notices_open ?? 0, icon: AlertTriangle, tone: 'text-orange-600' },
    { label: 'Disciplinary open', value: compliance?.disciplinary_open ?? 0, icon: Users, tone: 'text-purple-600' },
  ];

  return (
    <RegistrarDeskChrome
      title="Legal & RTI Desk"
      subtitle="RTI requests, court matters, legal notices, committee cases, and statutory compliance — backed by registrar APIs."
      banner={
        compliance && compliance.rti_due_soon > 0 ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <AlertTriangle className="mr-1 inline h-3.5 w-3.5" aria-hidden />
            {compliance.rti_due_soon} RTI {compliance.rti_due_soon === 1 ? 'reply is' : 'replies are'} due within 7 days.
          </p>
        ) : null
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {kpis.map((k) => (
          <Card key={k.label} className="border-sgvu-navy/10 bg-white shadow-sm">
            <CardContent className="flex items-center gap-3 p-4">
              <span className="rounded-xl border border-sgvu-navy/10 bg-white p-2">
                <k.icon className={cn('h-5 w-5', k.tone)} aria-hidden />
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
        <CardContent className="flex flex-wrap gap-2 p-3">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={cn(
                'h-9 rounded-lg px-3 text-sm font-semibold',
                tab === t.id ? REG_BRAND_BTN : REG_OUTLINE_BTN,
              )}
              onClick={() => {
                setTab(t.id);
                setOffset(0);
                setStatusFilter('all');
                setQ('');
              }}
            >
              {t.label}
            </button>
          ))}
        </CardContent>
      </Card>

      {tab !== 'compliance' ? (
        <>
          <Card className="border-sgvu-navy/10 bg-white shadow-sm">
            <CardContent className="grid gap-3 p-4 md:grid-cols-5">
              <label className="md:col-span-2 space-y-1">
                <span className="text-xs text-muted-foreground">Search</span>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-10 pl-9"
                    value={q}
                    onChange={(e) => {
                      setQ(e.target.value);
                      setOffset(0);
                    }}
                    placeholder="Reference, name, subject…"
                  />
                </div>
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Status</span>
                <Select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setOffset(0);
                  }}
                  className="h-10"
                >
                  <option value="all">All statuses</option>
                  {tab === 'court' ? (
                    <>
                      <option value="ACTIVE">Active</option>
                      <option value="CLOSED">Closed</option>
                    </>
                  ) : (
                    <>
                      <option value="OPEN">Open</option>
                      <option value="PENDING">Pending</option>
                      <option value="CLOSED">Closed</option>
                      <option value="REPLIED">Replied</option>
                    </>
                  )}
                </Select>
              </label>
              <div className="flex items-end gap-2 md:col-span-2">
                <button type="button" className={cn('h-10 rounded-lg px-3 text-sm font-semibold', REG_BRAND_BTN)} onClick={openCreate}>
                  Add record
                </button>
                <button type="button" className={cn('h-10 rounded-lg px-3 text-sm font-semibold', REG_OUTLINE_BTN)} onClick={handleExport}>
                  Export
                </button>
                <button type="button" className={cn('h-10 rounded-lg px-3 text-sm font-semibold', REG_OUTLINE_BTN)} onClick={handlePrint}>
                  <Printer className="mr-1 inline h-4 w-4" aria-hidden />
                  Print
                </button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-sgvu-navy/10 bg-white shadow-sm">
            <CardHeader className="border-b border-sgvu-navy/10 pb-3">
              <CardTitle className="text-base font-bold text-sgvu-navy">
                {TABS.find((t) => t.id === tab)?.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : activeRows.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">No records match your filters.</div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    {tab === 'rti' ? (
                      <Table className="min-w-[900px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead className={TABLE_HEAD}>Reference</TableHead>
                            <TableHead className={TABLE_HEAD}>Applicant</TableHead>
                            <TableHead className={TABLE_HEAD}>Subject</TableHead>
                            <TableHead className={TABLE_HEAD}>Status</TableHead>
                            <TableHead className={TABLE_HEAD}>Due</TableHead>
                            <TableHead className={TABLE_HEAD} />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(pageRows as RtiRow[]).map((r) => (
                            <TableRow key={r.rti_id} className="border-sgvu-navy/5">
                              <TableCell className={cn(CELL, 'font-medium')}>{r.reference_no}</TableCell>
                              <TableCell className={CELL}>{r.applicant_name}</TableCell>
                              <TableCell className={CELL}>{r.subject}</TableCell>
                              <TableCell className={CELL}>
                                <Badge variant="outline" className="border-transparent bg-sgvu-navy/5">{r.status}</Badge>
                              </TableCell>
                              <TableCell className={CELL}>
                                <span className={dueSoon(r.due_date) ? 'font-semibold text-amber-700' : ''}>
                                  {fmtDate(r.due_date)}
                                </span>
                              </TableCell>
                              <TableCell className={CELL}>
                                <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => { setEditRti(r); setDialogOpen(true); }}>
                                  Edit
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : null}
                    {tab === 'court' ? (
                      <Table className="min-w-[900px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead className={TABLE_HEAD}>Case no.</TableHead>
                            <TableHead className={TABLE_HEAD}>Title</TableHead>
                            <TableHead className={TABLE_HEAD}>Court</TableHead>
                            <TableHead className={TABLE_HEAD}>Status</TableHead>
                            <TableHead className={TABLE_HEAD}>Next hearing</TableHead>
                            <TableHead className={TABLE_HEAD} />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(pageRows as CourtRow[]).map((r) => (
                            <TableRow key={r.case_id}>
                              <TableCell className={cn(CELL, 'font-medium')}>{r.case_number}</TableCell>
                              <TableCell className={CELL}>{r.title}</TableCell>
                              <TableCell className={CELL}>{r.court_name ?? '—'}</TableCell>
                              <TableCell className={CELL}>{r.status}</TableCell>
                              <TableCell className={CELL}>{fmtDate(r.next_hearing)}</TableCell>
                              <TableCell className={CELL}>
                                <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => { setEditCourt(r); setDialogOpen(true); }}>
                                  Edit
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : null}
                    {tab === 'notices' ? (
                      <Table className="min-w-[800px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead className={TABLE_HEAD}>Notice no.</TableHead>
                            <TableHead className={TABLE_HEAD}>Title</TableHead>
                            <TableHead className={TABLE_HEAD}>Party</TableHead>
                            <TableHead className={TABLE_HEAD}>Status</TableHead>
                            <TableHead className={TABLE_HEAD}>Due</TableHead>
                            <TableHead className={TABLE_HEAD} />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(pageRows as NoticeRow[]).map((r) => (
                            <TableRow key={r.notice_id}>
                              <TableCell className={cn(CELL, 'font-medium')}>{r.notice_number}</TableCell>
                              <TableCell className={CELL}>{r.title}</TableCell>
                              <TableCell className={CELL}>{r.party ?? '—'}</TableCell>
                              <TableCell className={CELL}>{r.status}</TableCell>
                              <TableCell className={CELL}>{fmtDate(r.due_date)}</TableCell>
                              <TableCell className={CELL}>
                                <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => { setEditNotice(r); setDialogOpen(true); }}>
                                  Edit
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : null}
                    {tab === 'disciplinary' ? (
                      <Table className="min-w-[900px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead className={TABLE_HEAD}>Case no.</TableHead>
                            <TableHead className={TABLE_HEAD}>Student</TableHead>
                            <TableHead className={TABLE_HEAD}>Allegation</TableHead>
                            <TableHead className={TABLE_HEAD}>Committee</TableHead>
                            <TableHead className={TABLE_HEAD}>Status</TableHead>
                            <TableHead className={TABLE_HEAD} />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(pageRows as DisciplinaryRow[]).map((r) => (
                            <TableRow key={r.case_id}>
                              <TableCell className={cn(CELL, 'font-medium')}>{r.case_number}</TableCell>
                              <TableCell className={CELL}>{r.student_name ?? '—'}</TableCell>
                              <TableCell className={CELL}>{r.allegation}</TableCell>
                              <TableCell className={CELL}>{r.committee ?? '—'}</TableCell>
                              <TableCell className={CELL}>{r.status}</TableCell>
                              <TableCell className={CELL}>
                                <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => { setEditDisc(r); setDialogOpen(true); }}>
                                  Edit
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : null}
                  </div>
                  <div className="border-t border-sgvu-navy/10 p-4">
                    <PaginationBar total={activeRows.length} limit={PAGE} offset={offset} onPageChange={setOffset} />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card className="border-sgvu-navy/10 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between border-b border-sgvu-navy/10 pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-bold text-sgvu-navy">
              <ShieldCheck className="h-5 w-5 text-sgvu-gold" aria-hidden />
              Compliance dashboard
            </CardTitle>
            <button type="button" className={cn('h-9 rounded-lg px-3 text-sm font-semibold', REG_OUTLINE_BTN)} onClick={handleExport}>
              Export report
            </button>
          </CardHeader>
          <CardContent className="space-y-4 p-5 md:p-6">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading compliance…
              </div>
            ) : compliance ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded-xl border border-sgvu-navy/10 p-4">
                    <p className="text-xs text-muted-foreground">Pending RTI replies</p>
                    <p className="mt-1 text-2xl font-bold text-sgvu-navy">{compliance.rti_open}</p>
                  </div>
                  <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                    <p className="text-xs text-amber-800">Deadline alerts (7 days)</p>
                    <p className="mt-1 text-2xl font-bold text-amber-900">{compliance.rti_due_soon}</p>
                  </div>
                  <div className="rounded-xl border border-sgvu-navy/10 p-4">
                    <p className="text-xs text-muted-foreground">Active court cases</p>
                    <p className="mt-1 text-2xl font-bold text-sgvu-navy">{compliance.court_active}</p>
                  </div>
                  <div className="rounded-xl border border-sgvu-navy/10 p-4">
                    <p className="text-xs text-muted-foreground">Open legal notices</p>
                    <p className="mt-1 text-2xl font-bold text-sgvu-navy">{compliance.notices_open}</p>
                  </div>
                  <div className="rounded-xl border border-sgvu-navy/10 p-4">
                    <p className="text-xs text-muted-foreground">Open disciplinary cases</p>
                    <p className="mt-1 text-2xl font-bold text-sgvu-navy">{compliance.disciplinary_open}</p>
                  </div>
                </div>
                <div className="rounded-xl border border-sgvu-navy/10 bg-slate-50/80 p-4 text-sm text-muted-foreground">
                  <Scale className="mr-1 inline h-4 w-4 text-sgvu-navy" aria-hidden />
                  Compliance counts refresh from live registrar records. Use RTI and notices tabs to action pending replies.
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Compliance data unavailable.</p>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) { setEditRti(null); setEditCourt(null); setEditNotice(null); setEditDisc(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sgvu-navy">
              {editRti?.rti_id || editCourt?.case_id || editNotice?.notice_id || editDisc?.case_id ? 'Edit record' : 'New record'}
            </DialogTitle>
          </DialogHeader>
          {editRti ? (
            <div className="space-y-3">
              <label className="block space-y-1"><span className="text-xs text-muted-foreground">Reference no.</span><Input value={editRti.reference_no ?? ''} onChange={(e) => setEditRti({ ...editRti, reference_no: e.target.value })} /></label>
              <label className="block space-y-1"><span className="text-xs text-muted-foreground">Applicant</span><Input value={editRti.applicant_name ?? ''} onChange={(e) => setEditRti({ ...editRti, applicant_name: e.target.value })} /></label>
              <label className="block space-y-1"><span className="text-xs text-muted-foreground">Subject</span><Input value={editRti.subject ?? ''} onChange={(e) => setEditRti({ ...editRti, subject: e.target.value })} /></label>
              <label className="block space-y-1"><span className="text-xs text-muted-foreground">Department</span><Input value={editRti.department ?? ''} onChange={(e) => setEditRti({ ...editRti, department: e.target.value })} /></label>
              <label className="block space-y-1"><span className="text-xs text-muted-foreground">Due date</span><Input type="date" value={editRti.due_date?.slice(0, 10) ?? ''} onChange={(e) => setEditRti({ ...editRti, due_date: e.target.value })} /></label>
              <label className="block space-y-1"><span className="text-xs text-muted-foreground">Status</span><Select value={editRti.status ?? 'OPEN'} onChange={(e) => setEditRti({ ...editRti, status: e.target.value })} className="h-10"><option value="OPEN">Open</option><option value="PENDING">Pending</option><option value="REPLIED">Replied</option><option value="CLOSED">Closed</option></Select></label>
              <label className="block space-y-1"><span className="text-xs text-muted-foreground">Reply summary</span><textarea className="w-full rounded-md border px-3 py-2 text-sm" rows={3} value={editRti.reply_summary ?? ''} onChange={(e) => setEditRti({ ...editRti, reply_summary: e.target.value })} /></label>
            </div>
          ) : null}
          {editCourt ? (
            <div className="space-y-3">
              <label className="block space-y-1"><span className="text-xs text-muted-foreground">Case number</span><Input value={editCourt.case_number ?? ''} onChange={(e) => setEditCourt({ ...editCourt, case_number: e.target.value })} /></label>
              <label className="block space-y-1"><span className="text-xs text-muted-foreground">Title</span><Input value={editCourt.title ?? ''} onChange={(e) => setEditCourt({ ...editCourt, title: e.target.value })} /></label>
              <label className="block space-y-1"><span className="text-xs text-muted-foreground">Court</span><Input value={editCourt.court_name ?? ''} onChange={(e) => setEditCourt({ ...editCourt, court_name: e.target.value })} /></label>
              <label className="block space-y-1"><span className="text-xs text-muted-foreground">Counsel</span><Input value={editCourt.counsel ?? ''} onChange={(e) => setEditCourt({ ...editCourt, counsel: e.target.value })} /></label>
              <label className="block space-y-1"><span className="text-xs text-muted-foreground">Next hearing</span><Input type="date" value={editCourt.next_hearing?.slice(0, 10) ?? ''} onChange={(e) => setEditCourt({ ...editCourt, next_hearing: e.target.value })} /></label>
              <label className="block space-y-1"><span className="text-xs text-muted-foreground">Status</span><Select value={editCourt.status ?? 'ACTIVE'} onChange={(e) => setEditCourt({ ...editCourt, status: e.target.value })} className="h-10"><option value="ACTIVE">Active</option><option value="CLOSED">Closed</option></Select></label>
            </div>
          ) : null}
          {editNotice ? (
            <div className="space-y-3">
              <label className="block space-y-1"><span className="text-xs text-muted-foreground">Notice number</span><Input value={editNotice.notice_number ?? ''} onChange={(e) => setEditNotice({ ...editNotice, notice_number: e.target.value })} /></label>
              <label className="block space-y-1"><span className="text-xs text-muted-foreground">Title</span><Input value={editNotice.title ?? ''} onChange={(e) => setEditNotice({ ...editNotice, title: e.target.value })} /></label>
              <label className="block space-y-1"><span className="text-xs text-muted-foreground">Party</span><Input value={editNotice.party ?? ''} onChange={(e) => setEditNotice({ ...editNotice, party: e.target.value })} /></label>
              <label className="block space-y-1"><span className="text-xs text-muted-foreground">Due date</span><Input type="date" value={editNotice.due_date?.slice(0, 10) ?? ''} onChange={(e) => setEditNotice({ ...editNotice, due_date: e.target.value })} /></label>
              <label className="block space-y-1"><span className="text-xs text-muted-foreground">Status</span><Select value={editNotice.status ?? 'OPEN'} onChange={(e) => setEditNotice({ ...editNotice, status: e.target.value })} className="h-10"><option value="OPEN">Open</option><option value="CLOSED">Closed</option></Select></label>
            </div>
          ) : null}
          {editDisc ? (
            <div className="space-y-3">
              <label className="block space-y-1"><span className="text-xs text-muted-foreground">Case number</span><Input value={editDisc.case_number ?? ''} onChange={(e) => setEditDisc({ ...editDisc, case_number: e.target.value })} /></label>
              <label className="block space-y-1"><span className="text-xs text-muted-foreground">Student name</span><Input value={editDisc.student_name ?? ''} onChange={(e) => setEditDisc({ ...editDisc, student_name: e.target.value })} /></label>
              <label className="block space-y-1"><span className="text-xs text-muted-foreground">Allegation</span><textarea className="w-full rounded-md border px-3 py-2 text-sm" rows={3} value={editDisc.allegation ?? ''} onChange={(e) => setEditDisc({ ...editDisc, allegation: e.target.value })} /></label>
              <label className="block space-y-1"><span className="text-xs text-muted-foreground">Committee</span><Input value={editDisc.committee ?? ''} onChange={(e) => setEditDisc({ ...editDisc, committee: e.target.value })} /></label>
              <label className="block space-y-1"><span className="text-xs text-muted-foreground">Status</span><Select value={editDisc.status ?? 'OPEN'} onChange={(e) => setEditDisc({ ...editDisc, status: e.target.value })} className="h-10"><option value="OPEN">Open</option><option value="CLOSED">Closed</option></Select></label>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button className={REG_BRAND_BTN} disabled={saving} onClick={() => void saveRecord()}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RegistrarDeskChrome>
  );
}
