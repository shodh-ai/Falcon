'use client';

import { Select } from '@/components/ui/select';
import { useEffect, useState, useMemo } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Loader2, Save, Send } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';

const MARK_COLUMNS = [
  { id: 'WT1', label: 'WT1', max: 10, readOnly: true },
  { id: 'WT2', label: 'WT2', max: 10, readOnly: true },
  { id: 'GA1', label: 'GA1', max: 5, readOnly: false },
  { id: 'GA2', label: 'GA2', max: 5, readOnly: false },
  { id: 'MTE1', label: 'MTE1', max: 15, readOnly: false },
  { id: 'MTE2', label: 'MTE2', max: 15, readOnly: false },
  { id: 'ETE', label: 'ETE', max: 40, readOnly: false },
] as const;

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

export default function FacultyGradingPage() {
  const api = useAuthedApi();
  const { courses, loading: coursesLoading } = useFacultyCourses();
  const [courseId, setCourseId] = useState('');
  const [rows, setRows] = useState<UnifiedMarkRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);

  const courseOptions = useMemo(() => {
    const unique = new Map();
    for (const c of courses) {
      if (!unique.has(c.course_id)) {
        unique.set(c.course_id, c);
      }
    }
    return Array.from(unique.values());
  }, [courses]);

  const selectedCourse = courseOptions.find((c) => c.course_id === courseId);

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

  function updateMark(studentId: string, examType: string, value: string) {
    const col = MARK_COLUMNS.find((c) => c.id === examType);
    if (!col) return;
    const num = value === '' ? null : Number(value);

    setRows((prev) =>
      prev.map((r) => {
        if (r.student_user_id !== studentId) return r;
        if (num !== null && num > col.max) {
          toast.error(`Cannot exceed ${col.max} for ${examType}`);
          return r;
        }
        return {
          ...r,
          marks: {
            ...r.marks,
            [examType]: {
              ...(r.marks[examType] || { status: 'DRAFT' }),
              obtained: num,
            },
          },
        };
      }),
    );
  }

  async function saveDraft(): Promise<boolean> {
    if (!courseId) return false;

    const entriesByExamType: Record<
      string,
      { student_user_id: string; marks_obtained: number }[]
    > = {};

    for (const r of rows) {
      for (const col of MARK_COLUMNS) {
        if (col.readOnly) continue;
        const m = r.marks[col.id];
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
      toast.error('No new marks to save.');
      return false;
    }

    setSaving(true);
    try {
      for (const examType of typesToSave) {
        const entries = entriesByExamType[examType];
        const col = MARK_COLUMNS.find((c) => c.id === examType);
        await api.post('/api/academics/faculty/workspaces/marks/draft', {
          course_id: courseId,
          exam_type: examType,
          max_marks: col?.max || 100,
          entries,
        });
      }

      toast.success('Draft saved successfully');
      // Reload
      const data = await api.get<UnifiedMarkRow[]>(
        `/api/academics/faculty/workspaces/course/${encodeURIComponent(courseId)}/unified-marks`,
      );
      setRows(data);
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
      // Auto-save draft before publishing
      await saveDraft();

      const result = await api.post<{ published: number }>(
        `/api/academics/faculty/workspaces/course/${encodeURIComponent(courseId)}/publish-all`,
      );

      if ((result.published ?? 0) === 0) {
        toast.warning('No marks were published.');
      } else {
        toast.success(`Published marks for course successfully.`);
      }

      // Reload
      const data = await api.get<UnifiedMarkRow[]>(
        `/api/academics/faculty/workspaces/course/${encodeURIComponent(courseId)}/unified-marks`,
      );
      setRows(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setSaving(false);
    }
  }

  const isPublishable = rows.some((r) =>
    MARK_COLUMNS.some((c) => {
      const m = r.marks[c.id];
      return m && m.obtained !== null && m.status !== 'PUBLISHED';
    })
  );

  return (
    <FacultyPageShell>
      <FacultyPageHeader
        description="Unified Marks Entry for all assessments."
        meta={
          courseId ? (
            <>
              <FacultyMetricChip label="Course" value={selectedCourse?.course_code ?? '—'} emphasis />
              <FacultyMetricChip label="Students" value={rows.length} />
            </>
          ) : null
        }
      />

      <FacultyPanel title="Select Course" description="Choose a course to load the grading roster">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
        </div>
      </FacultyPanel>

      <FacultyPanel
        title="Student Marks Ledger"
        count={rows.length}
        description="Enter marks for all manual components. WT1 and WT2 are auto-graded."
      >
        <div className="mb-4 flex flex-wrap justify-end gap-2">
          <Button variant="outline" size="sm" disabled={!courseId || saving || loading} onClick={() => void saveDraft()}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
            Save Draft
          </Button>
          <Button size="sm" disabled={!courseId || saving || loading || !isPublishable} onClick={() => void publishAll()}>
            <Send className="mr-1 h-4 w-4" />
            Publish All Marks
          </Button>
        </div>

        {loading ? (
          <FacultyInlineLoading label="Loading roster…" />
        ) : !courseId ? (
          <FacultyEmptyState description="Select a course to view the roster." />
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
                  {MARK_COLUMNS.map((col) => (
                    <th key={col.id} className="pb-2 pr-2 text-center">
                      {col.label} <span className="block text-[10px] opacity-70">(Max {col.max})</span>
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
                    <td className="py-2.5 pr-4 font-medium text-sgvu-navy">
                      {row.name}
                    </td>
                    {MARK_COLUMNS.map((col) => {
                      const m = row.marks[col.id];
                      const isLocked = m && (m.status === 'PUBLISHED' || m.status === 'PENDING_COE');
                      return (
                        <td key={col.id} className="py-2.5 pr-2 text-center">
                          <div className="flex flex-col items-center">
                            <Input
                              type="number"
                              min={0}
                              max={col.max}
                              className={`h-8 w-16 text-center ${isLocked ? 'bg-muted/50 border-transparent text-muted-foreground' : ''}`}
                              value={m?.obtained ?? ''}
                              disabled={col.readOnly || isLocked}
                              onChange={(e) => updateMark(row.student_user_id, col.id, e.target.value)}
                            />
                            {m?.status && m.status !== 'DRAFT' && (
                              <span className="text-[9px] uppercase mt-1 tracking-wider text-muted-foreground/80 font-medium">
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
