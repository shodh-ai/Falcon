'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, Loader2, Search } from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuthedApi } from '@/lib/api';
import { toast } from '@/lib/notifications/falcon-toast';
import { cn } from '@/lib/utils';

type RegRow = {
  registration_id: string;
  student_name?: string;
  official_email?: string;
  enrollment_no?: string;
  department_name?: string;
  program_name?: string;
  semester?: number;
  status?: string;
  window_title?: string;
  registrar_remarks?: string;
};

const PAGE = 10;

const REVIEW_ACTIONS = [
  { action: 'APPROVED' as const, label: 'Approve' },
  { action: 'REJECTED' as const, label: 'Reject' },
  { action: 'SENT_BACK' as const, label: 'Send back' },
];

export function SemesterRegistrationWorkspace() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<RegRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [department, setDepartment] = useState('');
  const [program, setProgram] = useState('');
  const [semester, setSemester] = useState('');
  const [offset, setOffset] = useState(0);
  const [review, setReview] = useState<{
    row: RegRow;
    action: 'APPROVED' | 'REJECTED' | 'SENT_BACK';
  } | null>(null);
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (status !== 'all') params.set('status', status);
      if (department.trim()) params.set('department', department.trim());
      if (program.trim()) params.set('program', program.trim());
      if (semester.trim()) params.set('semester', semester.trim());
      const data = await api.get<RegRow[]>(
        `${REGISTRAR_DESK.registrations}?${params}`,
      );
      setRows(Array.isArray(data) ? data : []);
      setOffset(0);
    } catch (e) {
      toast.error('Could not load registrations', {
        description: e instanceof Error ? e.message : 'Request failed',
      });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [api, q, status, department, program, semester]);

  useEffect(() => {
    void load();
  }, [load]);

  const pageRows = useMemo(() => rows.slice(offset, offset + PAGE), [rows, offset]);

  async function submitReview() {
    if (!review) return;
    setSaving(true);
    try {
      await api.post(REGISTRAR_DESK.registrationReview(review.row.registration_id), {
        status: review.action,
        remarks: remarks.trim() || undefined,
      });
      toast.success(
        review.action === 'APPROVED'
          ? 'Registration approved'
          : review.action === 'REJECTED'
            ? 'Registration rejected'
            : 'Sent back for correction',
      );
      setReview(null);
      setRemarks('');
      void load();
    } catch (e) {
      toast.error('Review failed', { description: e instanceof Error ? e.message : 'Error' });
    } finally {
      setSaving(false);
    }
  }

  function exportCsv() {
    const header = ['Student', 'Enrollment', 'Department', 'Program', 'Semester', 'Status', 'Remarks'];
    const body = rows.map((r) =>
      [
        r.student_name ?? '',
        r.enrollment_no ?? '',
        r.department_name ?? '',
        r.program_name ?? '',
        r.semester ?? '',
        r.status ?? '',
        r.registrar_remarks ?? '',
      ]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(','),
    );
    const blob = new Blob([[header.join(','), ...body].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'semester-registrations.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <RegistrarDeskChrome
      title="Semester Registration Approval"
      subtitle="Approve, reject, or send back student semester registrations with remarks."
    >
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="grid gap-3 p-4 md:grid-cols-6">
          <label className="md:col-span-2 space-y-1">
            <span className="text-xs text-muted-foreground">Student</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="h-10 pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or enrollment…" />
            </div>
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Status</span>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="SUBMITTED">Submitted</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
                <SelectItem value="SENT_BACK">Sent back</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Department</span>
            <Input className="h-10" value={department} onChange={(e) => setDepartment(e.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Program</span>
            <Input className="h-10" value={program} onChange={(e) => setProgram(e.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Semester</span>
            <Input className="h-10" value={semester} onChange={(e) => setSemester(e.target.value)} />
          </label>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <button type="button" className={cn('h-10 rounded-lg px-4 text-sm font-semibold', REG_BRAND_BTN)} onClick={exportCsv}>
          Export
        </button>
        <button type="button" className={cn('h-10 rounded-lg px-4 text-sm font-semibold', REG_OUTLINE_BTN)} onClick={() => void load()}>
          Refresh
        </button>
      </div>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardHeader className="border-b border-sgvu-navy/10 pb-3">
          <CardTitle className="text-base font-bold text-sgvu-navy">Registrations</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              No semester registrations match your filters.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table className="min-w-[900px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Program</TableHead>
                      <TableHead>Semester</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((r) => (
                      <TableRow key={r.registration_id}>
                        <TableCell>
                          <p className="font-medium text-sgvu-navy">{r.student_name}</p>
                          <p className="text-xs text-muted-foreground">{r.enrollment_no ?? r.official_email}</p>
                        </TableCell>
                        <TableCell>{r.department_name ?? '—'}</TableCell>
                        <TableCell>{r.program_name ?? '—'}</TableCell>
                        <TableCell>{r.semester ?? '—'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="border-transparent bg-sgvu-navy/5 text-sgvu-navy">
                            {r.status ?? '—'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="sm"
                                className={cn(
                                  'h-8 gap-1.5 px-3 text-xs font-semibold',
                                  REG_BRAND_BTN,
                                )}
                              >
                                View
                                <ChevronDown className="h-3.5 w-3.5 opacity-90" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">
                                Registration review
                              </DropdownMenuLabel>
                              {REVIEW_ACTIONS.map(({ action, label }) => (
                                <DropdownMenuItem
                                  key={action}
                                  onSelect={() => {
                                    setReview({ row: r, action });
                                    setRemarks(r.registrar_remarks ?? '');
                                  }}
                                >
                                  {label}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
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

      <Dialog open={!!review} onOpenChange={(o) => !o && setReview(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {review?.action === 'APPROVED'
                ? 'Approve registration'
                : review?.action === 'REJECTED'
                  ? 'Reject registration'
                  : 'Send back registration'}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{review?.row.student_name}</p>
          <Textarea
            placeholder="Registrar remarks"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReview(null)}>Cancel</Button>
            <Button className={REG_BRAND_BTN} disabled={saving} onClick={() => void submitReview()}>
              {saving ? 'Saving…' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RegistrarDeskChrome>
  );
}
