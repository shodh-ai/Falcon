'use client';

import { useCallback, useEffect, useState } from 'react';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuthedApi } from '@/lib/api';
import { toast } from '@/lib/notifications/falcon-toast';
import { cn } from '@/lib/utils';

type StudentRow = {
  user_id: string;
  name: string;
  official_email?: string;
  enrollment_no?: string;
  prn_number?: string;
  department_name?: string;
  school_name?: string;
  program_name?: string;
  degree_name?: string;
  batch?: string;
  current_semester?: number;
  section_code?: string;
  advisor_name?: string;
};

const PAGE = 10;

export function AcademicPlacementWorkspace() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [department, setDepartment] = useState('');
  const [program, setProgram] = useState('');
  const [semester, setSemester] = useState('');
  const [section, setSection] = useState('');
  const [selected, setSelected] = useState<StudentRow | null>(null);
  const [form, setForm] = useState({
    school_name: '',
    department_name: '',
    program_name: '',
    degree_name: '',
    batch: '',
    semester: '',
    section_code: '',
    advisor_name: '',
  });
  const [history, setHistory] = useState<Array<Record<string, unknown>>>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE),
        offset: String(offset),
      });
      if (q.trim()) params.set('q', q.trim());
      if (department.trim()) params.set('department', department.trim());
      if (program.trim()) params.set('program', program.trim());
      if (semester.trim()) params.set('semester', semester.trim());
      if (section.trim()) params.set('section', section.trim());
      const data = await api.get<{ rows: StudentRow[]; total: number }>(
        `${REGISTRAR_DESK.placementStudents}?${params}`,
      );
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      toast.error('Could not load students', {
        description: e instanceof Error ? e.message : 'Request failed',
      });
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [api, offset, q, department, program, semester, section]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openStudent(row: StudentRow) {
    setSelected(row);
    setForm({
      school_name: row.school_name ?? '',
      department_name: row.department_name ?? '',
      program_name: row.program_name ?? '',
      degree_name: row.degree_name ?? '',
      batch: row.batch ?? '',
      semester: row.current_semester != null ? String(row.current_semester) : '',
      section_code: row.section_code ?? '',
      advisor_name: row.advisor_name ?? '',
    });
    try {
      const h = await api.get<Array<Record<string, unknown>>>(
        `${REGISTRAR_DESK.placementHistory}?student_user_id=${row.user_id}`,
      );
      setHistory(Array.isArray(h) ? h : []);
    } catch {
      setHistory([]);
    }
  }

  async function saveAssignment() {
    if (!selected) return;
    setSaving(true);
    try {
      await api.post(REGISTRAR_DESK.placementAssign, {
        student_user_id: selected.user_id,
        school_name: form.school_name || undefined,
        department_name: form.department_name || undefined,
        program_name: form.program_name || undefined,
        degree_name: form.degree_name || undefined,
        batch: form.batch || undefined,
        semester: form.semester ? Number(form.semester) : undefined,
        section_code: form.section_code || undefined,
        advisor_name: form.advisor_name || undefined,
      });
      toast.success('Placement saved');
      await load();
      await openStudent(selected);
    } catch (e) {
      toast.error('Save failed', { description: e instanceof Error ? e.message : 'Error' });
    } finally {
      setSaving(false);
    }
  }

  async function bulkFromCsv(file: File) {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) {
      toast.warning('CSV needs a header and at least one row');
      return;
    }
    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const rows = lines.slice(1).map((line) => {
      const cols = line.split(',').map((c) => c.trim());
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        obj[h] = cols[i] ?? '';
      });
      return {
        enrollment_no: obj.enrollment_no || obj.prn || undefined,
        email: obj.email || undefined,
        school_name: obj.school || obj.school_name || undefined,
        department_name: obj.department || obj.department_name || undefined,
        program_name: obj.program || obj.program_name || undefined,
        degree_name: obj.degree || obj.degree_name || undefined,
        batch: obj.batch || undefined,
        semester: obj.semester ? Number(obj.semester) : undefined,
        section_code: obj.section || obj.section_code || undefined,
        advisor_name: obj.advisor || obj.advisor_name || undefined,
      };
    });
    try {
      const result = await api.post<{ success: number; failed: number }>(REGISTRAR_DESK.placementBulk, {
        rows,
      });
      toast.success('Bulk placement completed', {
        description: `${result.success} ok · ${result.failed} failed`,
      });
      void load();
    } catch (e) {
      toast.error('Bulk import failed', { description: e instanceof Error ? e.message : 'Error' });
    }
  }

  function exportCsv() {
    const header = [
      'Name',
      'Email',
      'Enrollment',
      'School',
      'Department',
      'Program',
      'Degree',
      'Batch',
      'Semester',
      'Section',
      'Advisor',
    ];
    const body = rows.map((r) =>
      [
        r.name,
        r.official_email ?? '',
        r.enrollment_no ?? r.prn_number ?? '',
        r.school_name ?? '',
        r.department_name ?? '',
        r.program_name ?? '',
        r.degree_name ?? '',
        r.batch ?? '',
        r.current_semester ?? '',
        r.section_code ?? '',
        r.advisor_name ?? '',
      ]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(','),
    );
    const blob = new Blob([[header.join(','), ...body].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'academic-placement.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <RegistrarDeskChrome
      title="Academic Placement"
      subtitle="Assign school, department, program, degree, batch, semester, section, and academic advisor."
    >
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="grid gap-3 p-4 md:grid-cols-6">
          <label className="md:col-span-2 space-y-1">
            <span className="text-xs text-muted-foreground">Search</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="h-10 pl-9" value={q} onChange={(e) => { setOffset(0); setQ(e.target.value); }} placeholder="Name, email, enrollment…" />
            </div>
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Department</span>
            <Input className="h-10" value={department} onChange={(e) => { setOffset(0); setDepartment(e.target.value); }} />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Program</span>
            <Input className="h-10" value={program} onChange={(e) => { setOffset(0); setProgram(e.target.value); }} />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Semester</span>
            <Input className="h-10" value={semester} onChange={(e) => { setOffset(0); setSemester(e.target.value); }} />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Section</span>
            <Input className="h-10" value={section} onChange={(e) => { setOffset(0); setSection(e.target.value); }} />
          </label>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <button type="button" className={cn('h-10 rounded-lg px-4 text-sm font-semibold', REG_BRAND_BTN)} onClick={exportCsv}>
          Export
        </button>
        <label className={cn('inline-flex h-10 cursor-pointer items-center rounded-lg px-4 text-sm font-semibold', REG_OUTLINE_BTN)}>
          Bulk Excel / CSV
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void bulkFromCsv(f);
              e.target.value = '';
            }}
          />
        </label>
        <button type="button" className={cn('h-10 rounded-lg px-4 text-sm font-semibold', REG_OUTLINE_BTN)} onClick={() => void load()}>
          Refresh
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
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
              <div className="py-16 text-center text-sm text-muted-foreground">No students match your filters.</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table className="min-w-[720px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead>Enrollment</TableHead>
                        <TableHead>Program</TableHead>
                        <TableHead>Sem / Sec</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r) => (
                        <TableRow key={r.user_id} className={selected?.user_id === r.user_id ? 'bg-sgvu-gold/5' : ''}>
                          <TableCell>
                            <p className="font-medium text-sgvu-navy">{r.name}</p>
                            <p className="text-xs text-muted-foreground">{r.official_email}</p>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{r.enrollment_no ?? r.prn_number ?? '—'}</TableCell>
                          <TableCell>{r.program_name ?? '—'}</TableCell>
                          <TableCell>
                            {r.current_semester ?? '—'} / {r.section_code ?? '—'}
                          </TableCell>
                          <TableCell>
                            <Button size="sm" className={cn('h-8', REG_BRAND_BTN)} onClick={() => void openStudent(r)}>
                              Place
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="border-t border-sgvu-navy/10 p-4">
                  <PaginationBar total={total} limit={PAGE} offset={offset} onPageChange={setOffset} />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-sgvu-navy/10 bg-white shadow-sm">
          <CardHeader className="border-b border-sgvu-navy/10 pb-3">
            <CardTitle className="text-base font-bold text-sgvu-navy">
              {selected ? `Assign — ${selected.name}` : 'Assignment'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-5">
            {!selected ? (
              <p className="text-sm text-muted-foreground">Select a student to assign academic placement.</p>
            ) : (
              <>
                {(
                  [
                    ['school_name', 'School'],
                    ['department_name', 'Department'],
                    ['program_name', 'Program'],
                    ['degree_name', 'Degree'],
                    ['batch', 'Batch'],
                    ['semester', 'Semester'],
                    ['section_code', 'Section'],
                    ['advisor_name', 'Academic Advisor'],
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
                <button
                  type="button"
                  disabled={saving}
                  className={cn('h-10 w-full rounded-lg text-sm font-semibold', REG_BRAND_BTN)}
                  onClick={() => void saveAssignment()}
                >
                  {saving ? 'Saving…' : 'Save placement'}
                </button>
                <div className="space-y-2 border-t border-sgvu-navy/10 pt-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-sgvu-navy/55">Assignment history</p>
                  {history.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No history yet.</p>
                  ) : (
                    history.slice(0, 6).map((h) => (
                      <div key={String(h.history_id)} className="rounded-lg border border-sgvu-navy/10 px-3 py-2 text-xs">
                        <Badge variant="outline" className="mb-1 border-transparent bg-blue-50 text-blue-800">
                          {String(h.change_source ?? 'MANUAL')}
                        </Badge>
                        <p className="text-sgvu-navy">
                          {[h.program_name, h.semester != null ? `Sem ${h.semester}` : null, h.section_code]
                            .filter(Boolean)
                            .join(' · ') || 'Updated'}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </RegistrarDeskChrome>
  );
}
