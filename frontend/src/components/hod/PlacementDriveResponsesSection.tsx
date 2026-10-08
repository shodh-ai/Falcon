'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Download, Loader2, Plus, Search } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/context/AuthContext';
import { downloadAuthedFile } from '@/lib/hod-download';
import type { useAuthedApi } from '@/lib/api';

type ResponseRow = {
  response_id: string;
  student_user_id?: string | null;
  student_name: string;
  student_email: string | null;
  enrollment_no: string | null;
  phone: string | null;
  submitted_at: string;
};

type DriveSummary = {
  drive_id: string;
  form_url: string | null;
  company_name?: string;
  job_role?: string | null;
  drive_date?: string | null;
};

type SearchStudent = {
  student_key: string;
  student_user_id: string | null;
  student_name: string;
  student_email: string | null;
  enrollment_no: string | null;
  phone: string | null;
  registered_on_current_drive: boolean;
  drives: Array<{
    drive_id: string;
    company_name: string;
    job_role: string | null;
    drive_date: string | null;
    submitted_at: string;
  }>;
};

type ApiClient = ReturnType<typeof useAuthedApi>;

function dedupeResponses(rows: ResponseRow[]): ResponseRow[] {
  const seen = new Set<string>();
  const out: ResponseRow[] = [];
  for (const row of rows) {
    const key =
      row.student_user_id ??
      (row.student_email ? row.student_email.toLowerCase() : null) ??
      (row.enrollment_no ? `enr:${row.enrollment_no}` : null) ??
      `name:${row.student_name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function formatDriveDate(value: string | null | undefined) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function PlacementDriveResponsesSection({
  api,
  drives,
  selectedDriveId,
  onSelectDriveId,
  selectedSubmittedDate,
  onSubmittedDateChange,
  selectedDrive,
  responses,
  onResponsesChange,
  onRegistrationAdded,
}: {
  api: ApiClient;
  drives: DriveSummary[];
  selectedDriveId: string | null;
  onSelectDriveId: (driveId: string) => void;
  selectedSubmittedDate: string;
  onSubmittedDateChange: (value: string) => void;
  selectedDrive: DriveSummary | null;
  responses: ResponseRow[];
  onResponsesChange: (rows: ResponseRow[]) => void;
  onRegistrationAdded?: () => void;
}) {
  const { token } = useAuth();
  const [addingId, setAddingId] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchStudent[]>([]);
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);

  const displayResponses = useMemo(() => dedupeResponses(responses), [responses]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void (async () => {
        setSearching(true);
        try {
          const driveParam = selectedDriveId ? `&drive_id=${encodeURIComponent(selectedDriveId)}` : '';
          const rows = await api.get<SearchStudent[]>(
            `/api/academics/hod/placement/students/search?q=${encodeURIComponent(q)}${driveParam}`,
          );
          setSearchResults(rows);
        } catch (e) {
          setSearchResults([]);
          toast.error(e instanceof Error ? e.message : 'Student search failed');
        } finally {
          setSearching(false);
        }
      })();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [api, searchQuery, selectedDriveId]);

  async function refreshResponses() {
    if (!selectedDriveId) return;
    const qs = selectedSubmittedDate ? `?submitted_date=${selectedSubmittedDate}` : '';
    const rows = await api.get<ResponseRow[]>(
      `/api/academics/hod/placement/drives/${selectedDriveId}/responses${qs}`,
    );
    onResponsesChange(rows);
  }

  async function exportRegistrations(responseId?: string) {
    if (!token || !selectedDriveId) {
      toast.error('Please sign in to download');
      return;
    }
    const exportKey = responseId ?? 'all';
    setExportingId(exportKey);
    try {
      const qs = responseId ? `?response_id=${encodeURIComponent(responseId)}` : '';
      const companySlug = (selectedDrive?.company_name ?? 'drive')
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase();
      const filename = responseId
        ? `placement-${companySlug}-student.xlsx`
        : `placement-${companySlug}-all-students.xlsx`;
      await downloadAuthedFile(
        `/api/academics/hod/placement/drives/${selectedDriveId}/registrations/export${qs}`,
        token,
        filename,
      );
      toast.success(responseId ? 'Student report downloaded' : 'All students report downloaded');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExportingId(null);
    }
  }

  async function addStudentToDrive(student: SearchStudent) {
    if (!selectedDriveId) {
      toast.error('Select a drive first');
      return;
    }
    if (student.registered_on_current_drive) {
      toast.error('Student is already registered for this drive');
      return;
    }
    setAddingId(student.student_key);
    try {
      await api.post(`/api/academics/hod/placement/drives/${selectedDriveId}/responses`, {
        ...(student.student_user_id ? { student_user_id: student.student_user_id } : {}),
        student_name: student.student_name,
        student_email: student.student_email ?? undefined,
        enrollment_no: student.enrollment_no ?? undefined,
        phone: student.phone ?? undefined,
      });
      toast.success(`${student.student_name} added to this drive`);
      await refreshResponses();
      onRegistrationAdded?.();
      if (searchQuery.trim().length >= 2) {
        const driveParam = selectedDriveId ? `&drive_id=${encodeURIComponent(selectedDriveId)}` : '';
        const rows = await api.get<SearchStudent[]>(
          `/api/academics/hod/placement/students/search?q=${encodeURIComponent(searchQuery.trim())}${driveParam}`,
        );
        setSearchResults(rows);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add registration');
    } finally {
      setAddingId(null);
    }
  }

  const hasGoogleForm = Boolean(selectedDrive?.form_url);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-sgvu-navy uppercase tracking-wide">Drive</label>
          <Select
            value={selectedDriveId ?? undefined}
            onValueChange={(value) => onSelectDriveId(value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select drive" />
            </SelectTrigger>
            <SelectContent>
              {drives.map((d) => (
                <SelectItem key={d.drive_id} value={d.drive_id}>
                  {d.company_name}
                  {d.job_role ? ` · ${d.job_role}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-sgvu-navy uppercase tracking-wide">
            Registration date
          </label>
          <Input
            type="date"
            value={selectedSubmittedDate}
            onChange={(e) => onSubmittedDateChange(e.target.value)}
            disabled={!selectedDriveId}
          />
          <p className="text-[11px] text-muted-foreground">
            Optional — filter by when the student registered, not the drive date. Leave empty to show all.
          </p>
        </div>
      </div>

      {!selectedDriveId ? (
        <p className="text-sm text-muted-foreground">Select a drive to view registrations.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-sgvu-navy uppercase tracking-wide">
              {displayResponses.length} student{displayResponses.length === 1 ? '' : 's'}
              {selectedSubmittedDate ? ` on ${formatDriveDate(selectedSubmittedDate)}` : ''}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={displayResponses.length === 0 || exportingId === 'all'}
              onClick={() => void exportRegistrations()}
            >
              {exportingId === 'all' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Download all (Excel)
            </Button>
          </div>

          <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3 space-y-2">
            <p className="text-xs font-semibold text-sgvu-navy uppercase tracking-wide">
              Search student
            </p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search registered students (name, email, enrollment, phone)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            {searchQuery.trim().length >= 2 ? (
              <div className="rounded-md border border-slate-200 bg-white max-h-64 overflow-y-auto">
                {searching ? (
                  <p className="text-sm text-muted-foreground px-3 py-4 flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Searching…
                  </p>
                ) : searchResults.length === 0 ? (
                  <p className="text-sm text-muted-foreground px-3 py-4">No registered students found.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {searchResults.map((student) => {
                      const expanded = expandedStudentId === student.student_key;
                      return (
                        <li key={student.student_key} className="px-3 py-2">
                          <div className="flex items-start justify-between gap-2">
                            <button
                              type="button"
                              className="flex min-w-0 flex-1 items-start gap-1 text-left"
                              onClick={() =>
                                setExpandedStudentId((prev) =>
                                  prev === student.student_key ? null : student.student_key,
                                )
                              }
                            >
                              {student.drives.length > 0 ? (
                                expanded ? (
                                  <ChevronDown className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                                )
                              ) : (
                                <span className="w-4 shrink-0" />
                              )}
                              <span className="min-w-0">
                                <span className="font-medium text-sm block">{student.student_name}</span>
                                <span className="text-xs text-muted-foreground block truncate">
                                  {[student.student_email, student.enrollment_no, student.phone]
                                    .filter(Boolean)
                                    .join(' · ') || '—'}
                                </span>
                                {student.drives.length > 0 ? (
                                  <span className="text-[11px] text-sgvu-navy mt-0.5 block">
                                    Registered on {student.drives.length} drive
                                    {student.drives.length === 1 ? '' : 's'} — click to view
                                  </span>
                                ) : null}
                              </span>
                            </button>
                            <Button
                              size="sm"
                              variant={student.registered_on_current_drive ? 'outline' : 'default'}
                              className={`shrink-0 gap-1 h-8 ${student.registered_on_current_drive ? '' : 'bg-sgvu-navy'}`}
                              disabled={
                                student.registered_on_current_drive || addingId === student.student_key
                              }
                              onClick={() => void addStudentToDrive(student)}
                            >
                              {addingId === student.student_key ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Plus className="h-3.5 w-3.5" />
                              )}
                              {student.registered_on_current_drive ? 'On drive' : 'Add'}
                            </Button>
                          </div>
                          {expanded && student.drives.length > 0 ? (
                            <ul className="mt-2 ml-5 space-y-1 border-l border-slate-200 pl-3">
                              {student.drives.map((d) => (
                                <li key={`${student.student_key}-${d.drive_id}`} className="text-xs">
                                  <span className="font-medium">{d.company_name}</span>
                                  {d.job_role ? ` · ${d.job_role}` : ''}
                                  <span className="text-muted-foreground">
                                    {' '}
                                    · {formatDriveDate(d.drive_date)} · registered{' '}
                                    {new Date(d.submitted_at).toLocaleDateString('en-IN')}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ) : (
            <p className="text-xs text-muted-foreground">
              Search only students who have registered on at least one department drive. Type at least 2
              characters.
            </p>
            )}
          </div>

          {displayResponses.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {hasGoogleForm
                ? 'No registrations for this filter. Students confirm on their portal after submitting the Google Form.'
                : 'No student registrations for this filter.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase text-muted-foreground">
                    <th className="py-2 text-left">Student</th>
                    <th className="py-2 text-left">Contact</th>
                    <th className="py-2 text-left">Submitted</th>
                    <th className="py-2 text-right">Report</th>
                  </tr>
                </thead>
                <tbody>
                  {displayResponses.map((r) => (
                    <tr key={r.response_id} className="border-b border-slate-50">
                      <td className="py-2">
                        <p className="font-medium">{r.student_name}</p>
                        <p className="text-xs text-muted-foreground">{r.enrollment_no || '—'}</p>
                      </td>
                      <td className="py-2 text-xs">{r.student_email || r.phone || '—'}</td>
                      <td className="py-2 text-xs tabular-nums">
                        {new Date(r.submitted_at).toLocaleString('en-IN')}
                      </td>
                      <td className="py-2 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1 h-8 text-sgvu-navy"
                          disabled={exportingId === r.response_id}
                          onClick={() => void exportRegistrations(r.response_id)}
                        >
                          {exportingId === r.response_id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="h-3.5 w-3.5" />
                          )}
                          Excel
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
