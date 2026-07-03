'use client';

import { Select } from '@/components/ui/select';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
  const [rosterError, setRosterError] = useState<string | null>(null);

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
    return sortGradingComponents(columns);
  }, [selectedComponentIds]);

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
      return;
    }
    setSelectedComponentIds(loadStoredComponents(courseId));
  }, [courseId]);

  const reloadMarks = useCallback(async () => {
    if (!courseId) return;
    const data = await api.get<UnifiedMarkRow[]>(
      `/api/academics/faculty/workspaces/course/${encodeURIComponent(courseId)}/unified-marks`,
    );
    setRows(data);
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
          setRows(data);
        }
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : 'Failed to load marks';
          setRosterError(msg);
          setRows([]);
          toast.error(msg);
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

  async function saveDraft(options?: { silent?: boolean }): Promise<boolean> {
    if (!courseId) return false;

    const manualColumns = activeColumns.filter((col) => !col.readOnly);
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
      return false;
    }

    setSaving(true);
    try {
      for (const examType of typesToSave) {
        const entries = entriesByExamType[examType];
        const col = getGradingComponent(examType);
        await api.post('/api/academics/faculty/workspaces/marks/draft', {
          course_id: courseId,
          exam_type: examType,
          max_marks: col?.max ?? 100,
          entries,
        });
      }

      toast.success('Draft saved successfully');
      await reloadMarks();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function publishAll() {
    if (!courseId) return;
    setSaving(true);
    try {
      await saveDraft({ silent: true });

      const result = await api.post<{ published: number }>(
        `/api/academics/faculty/workspaces/course/${encodeURIComponent(courseId)}/publish-all`,
      );

      if ((result.published ?? 0) === 0) {
        toast.warning('No marks were published.');
      } else {
        toast.success('Published marks for course successfully.');
      }

      await reloadMarks();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setSaving(false);
    }
  }

  const isPublishable = rows.some((r) =>
    activeColumns.some((col) => {
      const m = getMarkValue(r, col.id);
      return m && m.obtained !== null && m.status !== 'PUBLISHED';
    }),
  );

  return (
    <FacultyPageShell>
      <FacultyPageHeader
        description="Select a course and grading components, then enter marks for manual assessments."
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
            WT1 and WT2 are auto-synced from weekly tests. All other components are entered manually.
          </p>
        ) : null}
      </FacultyPanel>

      <FacultyPanel
        title="Student Marks Ledger"
        count={rows.length}
        description="Enter marks for selected manual components. WT columns are read-only (auto-synced)."
      >
        <div className="mb-4 flex flex-wrap justify-end gap-2">
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
            disabled={!courseId || saving || loading || !isPublishable || activeColumns.length === 0}
            onClick={() => void publishAll()}
          >
            <Send className="mr-1 h-4 w-4" />
            Publish All Marks
          </Button>
        </div>

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
                              disabled={col.readOnly || isLocked}
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
