'use client';

import { Select } from '@/components/ui/select';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Loader2, Save, Send, ChevronDown } from 'lucide-react';
import {
  FacultyPageHeader,
  FacultyPageShell,
  FacultyEmptyState,
  FacultyErrorBanner,
  FacultyPanel,
  FacultyMetricChip,
  FacultyInlineLoading,
} from '@/components/faculty';
import { useFacultyCourses } from '@/components/faculty/useFacultyCourses';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuthedApi } from '@/lib/api';
import { validateMarksImport } from '@/lib/faculty/marks-import';
import * as XLSX from 'xlsx';
import { isEmptyArray, isFacultyDemoEntityId, withFacultyDemoFallback } from '@/lib/faculty-demo-mode';
import { facultyDemoUnifiedMarks } from '@/lib/mock/faculty-portal-demo';
import {
  GRADING_COMPONENT_CATALOG,
  GRADING_COMPONENT_GROUPS,
  getGradingComponent,
  normalizeExamType,
  sortComponentIds,
  sortGradingComponents,
  type GradingComponent,
} from '@/lib/faculty/grading-components';

const DEFAULT_COMPONENT_IDS = ['GA1', 'GA2', 'WT1', 'WT2', 'MT1', 'MT2', 'ETE'];
const STORAGE_PREFIX = 'falcon-faculty-grading-components';

type UnifiedMarkRow = {
  student_user_id: string;
  name: string;
  roll_number: string;
  marks: Record<
    string,
    {
      obtained: number | null;
      status: string | null;
    }
  >;
};

function loadStoredComponents(courseId: string): string[] {
  if (typeof window === 'undefined') return DEFAULT_COMPONENT_IDS;
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}:${courseId}`);
    if (!raw) return DEFAULT_COMPONENT_IDS;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_COMPONENT_IDS;
    return sortComponentIds(parsed.filter((id): id is string => typeof id === 'string'));
  } catch {
    return DEFAULT_COMPONENT_IDS;
  }
}

function storeComponents(courseId: string, componentIds: string[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    `${STORAGE_PREFIX}:${courseId}`,
    JSON.stringify(sortComponentIds(componentIds)),
  );
}

export default function FacultyGradingPage() {
  const api = useAuthedApi();
  const { courses, loading: coursesLoading } = useFacultyCourses();
  const [courseId, setCourseId] = useState('');
  const [selectedComponentIds, setSelectedComponentIds] = useState<string[]>([]);
  const [rows, setRows] = useState<UnifiedMarkRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const submissionPending = useRef(false);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const [endTermSession, setEndTermSession] = useState<{ max_marks: number; entry_status: string; marks_locked: boolean; entry_open_at?: string | null; entry_close_at?: string | null } | null>(null);
  const [bulkPreviewCount, setBulkPreviewCount] = useState(0);

  const courseOptions = useMemo(() => {
    const unique = new Map<string, (typeof courses)[number]>();
    for (const c of courses) {
      if (!unique.has(c.course_id)) {
        unique.set(c.course_id, c);
      }
    }
    return Array.from(unique.values());
  }, [courses]);

  const selectedCourse = courseOptions.find((c) => c.course_id === courseId);

  const activeColumns = useMemo(() => {
    const columns = selectedComponentIds
      .map((id) => getGradingComponent(id))
      .filter((component): component is GradingComponent => Boolean(component));
    return sortGradingComponents(columns.map((component) => component.id === 'ETE' && endTermSession
      ? { ...component, max: Number(endTermSession.max_marks) }
      : component));
  }, [selectedComponentIds, endTermSession]);

  const endTermEntryOpen = endTermSession?.entry_status === 'OPEN' && !endTermSession.marks_locked
    && (!endTermSession.entry_open_at || Date.parse(endTermSession.entry_open_at) <= Date.now())
    && (!endTermSession.entry_close_at || Date.parse(endTermSession.entry_close_at) >= Date.now());

  const componentsByGroup = useMemo(() => {
    return GRADING_COMPONENT_GROUPS.map((group) => ({
      ...group,
      components: GRADING_COMPONENT_CATALOG.filter((c) => c.group === group.id),
    }));
  }, []);

  const componentPickerLabel = useMemo(() => {
    if (selectedComponentIds.length === 0) return 'Select components';
    if (selectedComponentIds.length <= 3) {
      return selectedComponentIds
        .map((id) => getGradingComponent(id)?.label ?? id)
        .join(', ');
    }
    return `${selectedComponentIds.length} components selected`;
  }, [selectedComponentIds]);

  function updateSelectedComponents(next: string[] | ((prev: string[]) => string[])) {
    setSelectedComponentIds((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      const sorted = sortComponentIds(resolved);
      if (courseId) storeComponents(courseId, sorted);
      return sorted;
    });
  }

  useEffect(() => {
    if (!courseId) {
      setSelectedComponentIds([]);
      setEndTermSession(null);
      return;
    }
    setSelectedComponentIds(loadStoredComponents(courseId));
    setBulkPreviewCount(0);
    let active = true;
    void api.get<{ result_session: typeof endTermSession }>(
      `/api/academics/faculty/workspaces/marks?courseId=${encodeURIComponent(courseId)}&examType=ETE`,
    ).then((value) => { if (active) setEndTermSession(value.result_session ?? null); })
      .catch(() => { if (active) setEndTermSession(null); });
    return () => { active = false; };
  }, [courseId, api]);

  function downloadEndTermTemplate() {
    if (!courseId || !rows.length || !endTermEntryOpen) return;
    const worksheet = XLSX.utils.json_to_sheet(rows.map((row) => ({
      student_user_id: row.student_user_id,
      roll_number: row.roll_number,
      student_name: row.name,
      marks_obtained: '',
    })));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'End-term marks');
    XLSX.writeFile(workbook, `${selectedCourse?.course_code ?? 'course'}-ETE-marks-template.xlsx`);
  }

  async function importEndTermSheet(file: File | undefined) {
    if (!file) return;
    try {
      if (!endTermEntryOpen || !endTermSession) throw new Error('Exam Cell has not opened end-semester marks entry');
      if (file.size > 5 * 1024 * 1024) throw new Error('Mark sheet must be 5 MB or smaller');
      if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw new Error('Use an Excel or CSV mark sheet');
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!worksheet) throw new Error('The mark sheet has no worksheet');
      const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '', raw: false });
      const marks = validateMarksImport(records, rows, Number(endTermSession.max_marks));
      const byId = new Map(marks.map((mark) => [mark.student_user_id, mark.marks_obtained]));
      if (rows.some((row) => row.marks.ETE?.status === 'PENDING_COE' || row.marks.ETE?.status === 'PUBLISHED')) {
        throw new Error('Some end-semester marks are already submitted or published; ask Exam Cell to reopen entry');
      }
      setRows((previous) => previous.map((row) => ({
        ...row,
        marks: { ...row.marks, ETE: { status: 'DRAFT', obtained: byId.get(row.student_user_id) ?? null } },
      })));
      setBulkPreviewCount(marks.length);
      toast.success(`${marks.length} students matched exactly. Review the marks below, then save draft and submit.`);
    } catch (error) {
      setBulkPreviewCount(0);
      toast.error(error instanceof Error ? error.message : 'Could not import mark sheet');
    } finally {
      if (importInput.current) importInput.current.value = '';
    }
  }

  const reloadMarks = useCallback(async () => {
    if (!courseId) return;
    try {
      const data = await api.get<UnifiedMarkRow[]>(
        `/api/academics/faculty/workspaces/course/${encodeURIComponent(courseId)}/unified-marks`,
      );
      setRows(
        withFacultyDemoFallback(
          data,
          facultyDemoUnifiedMarks(courseId) as UnifiedMarkRow[],
          isEmptyArray,
        ),
      );
    } catch {
      setRows(
        withFacultyDemoFallback(
          [],
          facultyDemoUnifiedMarks(courseId) as UnifiedMarkRow[],
          isEmptyArray,
        ),
      );
    }
  }, [api, courseId]);

  useEffect(() => {
    if (!courseId) {
      setRows([]);
      setRosterError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setRosterError(null);
      try {
        const data = await api.get<UnifiedMarkRow[]>(
          `/api/academics/faculty/workspaces/course/${encodeURIComponent(courseId)}/unified-marks`,
        );
        if (!cancelled) {
          setRows(
            withFacultyDemoFallback(
              data,
              facultyDemoUnifiedMarks(courseId) as UnifiedMarkRow[],
              isEmptyArray,
            ),
          );
        }
      } catch (e) {
        if (!cancelled) {
          const demo = withFacultyDemoFallback(
            [],
            facultyDemoUnifiedMarks(courseId) as UnifiedMarkRow[],
            isEmptyArray,
          );
          setRows(demo);
          if (demo.length === 0) {
            const msg = e instanceof Error ? e.message : 'Failed to load marks';
            setRosterError(msg);
            toast.error(msg);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, courseId]);

  function toggleComponent(componentId: string) {
    updateSelectedComponents((prev) =>
      prev.includes(componentId)
        ? prev.filter((id) => id !== componentId)
        : [...prev, componentId],
    );
  }

  function getMarkValue(row: UnifiedMarkRow, componentId: string) {
    const normalized = normalizeExamType(componentId);
    const direct = row.marks[componentId];
    if (direct) return direct;
    if (normalized !== componentId) {
      return row.marks[normalized];
    }
    return undefined;
  }

  function updateMark(studentId: string, component: GradingComponent, value: string) {
    const num = value === '' ? null : Number(value);

    setRows((prev) =>
      prev.map((r) => {
        if (r.student_user_id !== studentId) return r;
        if (num !== null && num > component.max) {
          toast.error(`Cannot exceed ${component.max} for ${component.label}`);
          return r;
        }
        return {
          ...r,
          marks: {
            ...r.marks,
            [component.id]: {
              ...(getMarkValue(r, component.id) || { status: 'DRAFT' }),
              obtained: num,
            },
          },
        };
      }),
    );
  }

  async function saveDraft(options?: { silent?: boolean; examTypes?: string[] }): Promise<boolean> {
    if (!courseId) return false;
    if (isFacultyDemoEntityId(courseId) || rows.some((r) => isFacultyDemoEntityId(r.student_user_id))) {
      toast.error('Demonstration marks cannot be saved to the database');
      return false;
    }

    const manualColumns = activeColumns.filter((col) => !col.readOnly && (!options?.examTypes || options.examTypes.includes(col.id)));
    const entriesByExamType: Record<
      string,
      { student_user_id: string; marks_obtained: number }[]
    > = {};

    for (const r of rows) {
      for (const col of manualColumns) {
        const m = getMarkValue(r, col.id);
        if (
          m &&
          m.obtained !== null &&
          m.status !== 'PENDING_COE' &&
          m.status !== 'PUBLISHED'
        ) {
          if (!entriesByExamType[col.id]) {
            entriesByExamType[col.id] = [];
          }
          entriesByExamType[col.id].push({
            student_user_id: r.student_user_id,
            marks_obtained: m.obtained,
          });
        }
      }
    }

    const typesToSave = Object.keys(entriesByExamType);
    if (typesToSave.length === 0) {
      if (!options?.silent) {
        toast.error('No new marks to save. Enter marks in the PE / GA / MTE / ETE columns first.');
      }
      return Boolean(options?.silent);
    }

    setSaving(true);
    try {
      for (const examType of typesToSave) {
        const entries = entriesByExamType[examType];
        const col = activeColumns.find((column) => column.id === examType);
        await api.post('/api/academics/faculty/workspaces/marks/draft', {
          course_id: courseId,
          exam_type: examType,
          max_marks: col?.max ?? 100,
          entries,
        });
      }

      toast.success('Draft saved successfully');
      setBulkPreviewCount(0);
      await reloadMarks();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function publishSelected(endTerm: boolean) {
    if (!courseId || submissionPending.current) return;
    if (endTerm && !endTermEntryOpen) {
      toast.error('Exam Cell must open the ETE marks window first');
      return;
    }
    if (isFacultyDemoEntityId(courseId) || rows.some((r) => isFacultyDemoEntityId(r.student_user_id))) {
      toast.error('Demonstration marks cannot be submitted');
      return;
    }
    const examTypes = activeColumns
      .filter((column) => !column.readOnly && (column.id === 'ETE') === endTerm)
      .filter((column) => rows.some((row) => {
        const mark = getMarkValue(row, column.id);
        return mark?.obtained != null && mark.status !== 'PENDING_COE' && mark.status !== 'PUBLISHED';
      }))
      .map((column) => column.id);
    if (!examTypes.length) {
      toast.error('No draft marks to submit for this action');
      return;
    }
    submissionPending.current = true;
    setSaving(true);
    try {
      if (!(await saveDraft({ silent: true, examTypes }))) return;
      let count = 0;
      for (const examType of examTypes) {
        const result = await api.post<{ published: number }>(
          '/api/academics/faculty/workspaces/marks/publish',
          { course_id: courseId, exam_type: examType },
        );
        count += result.published ?? 0;
      }
      toast.success(endTerm
        ? `${count} ETE marks submitted to the concerned HOD. Exam Cell must release them later.`
        : `${count} internal marks published directly to students.`);
      await reloadMarks();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Submission failed');
    } finally {
      submissionPending.current = false;
      setSaving(false);
    }
  }

  const hasPublishable = (endTerm: boolean) => rows.some((r) =>
    activeColumns.some((col) => {
      const m = getMarkValue(r, col.id);
      return !col.readOnly && (col.id === 'ETE') === endTerm && (!endTerm || endTermEntryOpen)
        && m && m.obtained !== null && m.status !== 'PENDING_COE' && m.status !== 'PUBLISHED';
    }),
  );

  return (
    <FacultyPageShell>
      <FacultyPageHeader
        title="Exams & Grades"
        description="Weekly tests are synced automatically. Faculty publishes quizzes and internal marks directly; end-semester marks go to HOD review and Exam Cell release."
        meta={
          courseId ? (
            <>
              <FacultyMetricChip label="Course" value={selectedCourse?.course_code ?? '—'} emphasis />
              <FacultyMetricChip label="Students" value={rows.length} />
              <FacultyMetricChip label="Components" value={activeColumns.length} />
            </>
          ) : null
        }
      />

      <FacultyPanel
        title="Course & Components"
        description="Choose a course and grading components from the dropdowns below."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1.5 block font-medium text-sgvu-navy">Course</span>
            <Select
              className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              disabled={coursesLoading}
            >
              <option value="">Select course</option>
              {courseOptions.map((c) => (
                <option key={c.course_id} value={c.course_id}>
                  {c.course_code} — {c.course_name}
                </option>
              ))}
            </Select>
          </label>

          <label className="text-sm">
            <span className="mb-1.5 block font-medium text-sgvu-navy">Components</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild disabled={!courseId}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-left disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className={selectedComponentIds.length === 0 ? 'text-muted-foreground' : ''}>
                    {courseId ? componentPickerLabel : 'Select course first'}
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="max-h-80 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto"
              >
                {componentsByGroup.map((group, groupIndex) => (
                  <div key={group.id}>
                    {groupIndex > 0 ? <DropdownMenuSeparator /> : null}
                    <DropdownMenuLabel className="text-xs text-muted-foreground">
                      {group.label}
                    </DropdownMenuLabel>
                    {group.components.map((component) => (
                      <DropdownMenuCheckboxItem
                        key={component.id}
                        checked={selectedComponentIds.includes(component.id)}
                        onSelect={(event) => event.preventDefault()}
                        onCheckedChange={() => toggleComponent(component.id)}
                      >
                        <span className="flex w-full items-center justify-between gap-2">
                          <span>{component.label}</span>
                          <span className="text-xs text-muted-foreground">
                            MM: {component.max}
                            {component.readOnly ? ' · auto' : ''}
                          </span>
                        </span>
                      </DropdownMenuCheckboxItem>
                    ))}
                  </div>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </label>
        </div>
        {courseId ? (
          <p className="mt-3 text-sm text-muted-foreground">
            WT1 and WT2 are auto-synced. Exam Cell must open the ETE window before entry; other manual components can publish directly.
          </p>
        ) : null}
      </FacultyPanel>

      <FacultyPanel
        title="Student Marks Ledger"
        count={rows.length}
        description="Enter marks for selected manual components. WT columns are read-only (auto-synced)."
      >
        <div className="mb-4 flex flex-wrap justify-end gap-2">
          {selectedComponentIds.includes('ETE') ? (
            <>
              <Button variant="outline" size="sm" disabled={!endTermEntryOpen || !rows.length || saving} onClick={downloadEndTermTemplate}>Download ETE template</Button>
              <Button variant="outline" size="sm" disabled={!endTermEntryOpen || !rows.length || saving} onClick={() => importInput.current?.click()}>Import ETE Excel/CSV</Button>
              <input ref={importInput} type="file" accept=".xlsx,.xls,.csv" className="hidden" aria-label="Import end-semester marks" onChange={(event) => void importEndTermSheet(event.target.files?.[0])} />
            </>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            disabled={!courseId || saving || loading || activeColumns.length === 0}
            onClick={() => void saveDraft()}
          >
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
            Save Draft
          </Button>
          <Button
            size="sm"
            disabled={!courseId || saving || loading || !hasPublishable(false)}
            onClick={() => void publishSelected(false)}
          >
            <Send className="mr-1 h-4 w-4" />
            Publish Internal Marks
          </Button>
          <Button
            size="sm"
            disabled={!courseId || saving || loading || !hasPublishable(true)}
            onClick={() => void publishSelected(true)}
          >
            <Send className="mr-1 h-4 w-4" />
            Submit ETE to HOD
          </Button>
        </div>
        {selectedComponentIds.includes('ETE') && !endTermEntryOpen ? (
          <p className="mb-4 rounded-lg border p-3 text-sm text-muted-foreground">End-semester marks entry is closed. Exam Cell must open a session for this course.</p>
        ) : null}
        {bulkPreviewCount > 0 ? <p className="mb-4 rounded-lg border p-3 text-sm">Imported {bulkPreviewCount} exact roster matches. Check the values below; importing has not submitted or published anything.</p> : null}

        {loading ? (
          <FacultyInlineLoading label="Loading roster…" />
        ) : !courseId ? (
          <FacultyEmptyState description="Select a course to view the roster." />
        ) : activeColumns.length === 0 ? (
          <FacultyEmptyState description="Select at least one grading component." />
        ) : rosterError ? (
          <FacultyErrorBanner message={rosterError} />
        ) : rows.length === 0 ? (
          <FacultyEmptyState description="No enrolled students found for this course." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs font-medium text-muted-foreground">
                  <th className="pb-2 pr-4">Roll Number</th>
                  <th className="pb-2 pr-4">Student</th>
                  {activeColumns.map((col) => (
                    <th key={col.id} className="pb-2 pr-2 text-center">
                      <span className="block max-w-[7rem] truncate" title={col.label}>
                        {col.label}
                      </span>
                      <span className="block text-[10px] opacity-70">(Max {col.max})</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.student_user_id} className="border-b border-border/40">
                    <td className="py-2.5 pr-4 text-xs font-medium text-muted-foreground">
                      {row.roll_number && row.roll_number.length <= 24 && !row.roll_number.includes('0000-4000')
                        ? row.roll_number
                        : '—'}
                    </td>
                    <td className="py-2.5 pr-4 font-medium text-sgvu-navy">{row.name}</td>
                    {activeColumns.map((col) => {
                      const m = getMarkValue(row, col.id);
                      const isLocked = m && (m.status === 'PUBLISHED' || m.status === 'PENDING_COE');
                      return (
                        <td key={col.id} className="py-2.5 pr-2 text-center">
                          <div className="flex flex-col items-center">
                            <Input
                              type="number"
                              min={0}
                              max={col.max}
                              className={`h-8 w-16 text-center ${isLocked || col.readOnly ? 'border-transparent bg-muted/50 text-muted-foreground' : ''}`}
                              value={m?.obtained ?? ''}
                              disabled={saving || col.readOnly || isLocked || (col.id === 'ETE' && !endTermEntryOpen)}
                              onChange={(e) => updateMark(row.student_user_id, col, e.target.value)}
                            />
                            {m?.status && m.status !== 'DRAFT' && (
                              <span className="mt-1 text-[9px] font-medium uppercase tracking-wider text-muted-foreground/80">
                                {m.status}
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </FacultyPanel>
    </FacultyPageShell>
  );
}
