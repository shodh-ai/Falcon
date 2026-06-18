'use client';

import { useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Loader2, Save, Send } from 'lucide-react';
import Link from 'next/link';
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

const EXAM_TYPES = ['CAT1', 'CAT2', 'QUIZ', 'END_TERM'] as const;

type MarkRow = {
  student_user_id: string;
  name: string;
  roll_number: string;
  marks_obtained: number | null;
  max_marks: number;
  co_mapped: string | null;
};

type MarksPayload = {
  exam_type: string;
  course_id: string;
  max_marks_default: number;
  publish_status: string;
  entry_allowed?: boolean;
  result_session?: {
    session_id: string;
    entry_status: string;
    marks_locked: boolean;
    declared_at?: string | null;
  } | null;
  rows: MarkRow[];
};

export default function FacultyGradingPage() {
  const api = useAuthedApi();
  const { courses, loading: coursesLoading } = useFacultyCourses();
  const [courseId, setCourseId] = useState('');
  const [examType, setExamType] = useState<(typeof EXAM_TYPES)[number]>('CAT1');
  const [maxMarks, setMaxMarks] = useState(50);
  const [rows, setRows] = useState<MarkRow[]>([]);
  const [publishStatus, setPublishStatus] = useState('DRAFT');
  const [entryAllowed, setEntryAllowed] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);

  const selectedCourse = courses.find((c) => c.course_id === courseId);

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
        const data = await api.get<MarksPayload>(
          `/api/academics/faculty/workspaces/marks?courseId=${encodeURIComponent(courseId)}&examType=${examType}`,
        );
        if (!cancelled) {
          setRows(data.rows);
          setMaxMarks(data.max_marks_default ?? 50);
          setPublishStatus(data.publish_status);
          setEntryAllowed(data.entry_allowed ?? false);
          setSessionStatus(data.result_session?.entry_status ?? null);
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
  }, [api, courseId, examType]);

  function updateMark(studentId: string, value: string) {
    const num = value === '' ? null : Number(value);
    setRows((prev) =>
      prev.map((r) => {
        if (r.student_user_id !== studentId) return r;
        if (num !== null && num > maxMarks) {
          toast.error(`Cannot exceed ${maxMarks}`);
          return r;
        }
        return { ...r, marks_obtained: num };
      }),
    );
  }

  async function saveDraft(): Promise<boolean> {
    if (!courseId) return false;
    const entries = rows
      .filter((r) => r.marks_obtained !== null)
      .map((r) => ({
        student_user_id: r.student_user_id,
        marks_obtained: r.marks_obtained,
        co_mapped: r.co_mapped,
      }));
    if (entries.length === 0) {
      toast.error('Enter marks for at least one student before saving.');
      return false;
    }
    setSaving(true);
    try {
      await api.post('/api/academics/faculty/workspaces/marks/draft', {
        course_id: courseId,
        exam_type: examType,
        max_marks: maxMarks,
        entries,
      });
      toast.success('Draft saved');
      setPublishStatus('DRAFT');
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (!courseId) return;
    setSaving(true);
    try {
      const draftOk = await saveDraft();
      if (!draftOk) return;
      const result = await api.post<{ published: number }>('/api/academics/faculty/workspaces/marks/publish', {
        course_id: courseId,
        exam_type: examType,
      });
      if ((result.published ?? 0) === 0) {
        toast.warning('No draft marks were published. Save draft marks first.');
        return;
      }
      toast.success(`Marks submitted to Exam Cell for ${result.published} student${result.published === 1 ? '' : 's'}`);
      setPublishStatus('PENDING_COE');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setSaving(false);
    }
  }

  const enteredCount = rows.filter((r) => r.marks_obtained !== null).length;

  return (
    <FacultyPageShell>
      <FacultyPageHeader
        description="Spreadsheet-style marks entry with max-marks validation. Link assessments to COs via CO-PO Mapping."
        meta={
          courseId ? (
            <>
              <FacultyMetricChip label="Course" value={selectedCourse?.course_code ?? '—'} emphasis />
              <FacultyMetricChip label="Assessment" value={examType.replace('_', ' ')} />
              <FacultyMetricChip label="Students" value={rows.length} />
              <FacultyMetricChip label="Marks entered" value={enteredCount} />
            </>
          ) : null
        }
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/faculty/grading/copo">CO-PO Mapping</Link>
          </Button>
        }
      />

      {courseId && !entryAllowed ? (
        <FacultyErrorBanner
          message={
            sessionStatus
              ? `Marks entry is ${sessionStatus.toLowerCase()}. Exam Cell must open the result session before you can enter or submit marks.`
              : 'Exam Cell has not opened marks entry for this course and exam type yet.'
          }
        />
      ) : null}

      <FacultyPanel title="Assessment setup" description="Choose course, exam type, and max marks">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm">
            <span className="mb-1.5 block font-medium text-sgvu-navy">Course</span>
            <select
              className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              disabled={coursesLoading}
            >
              <option value="">Select course</option>
              {courses.map((c) => (
                <option key={c.course_id} value={c.course_id}>
                  {c.course_code} — {c.course_name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1.5 block font-medium text-sgvu-navy">Assessment type</span>
            <select
              className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
              value={examType}
              onChange={(e) => setExamType(e.target.value as (typeof EXAM_TYPES)[number])}
            >
              {EXAM_TYPES.map((t) => (
                <option key={t} value={t}>{t.replace('_', ' ')}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1.5 block font-medium text-sgvu-navy">Max marks</span>
            <Input
              type="number"
              min={1}
              value={maxMarks}
              onChange={(e) => setMaxMarks(Number(e.target.value) || 50)}
            />
          </label>
          <div className="flex items-end">
            <Badge
              variant={publishStatus === 'PUBLISHED' ? 'default' : publishStatus === 'PENDING_COE' ? 'outline' : 'secondary'}
              className="text-xs font-semibold uppercase tracking-wide"
            >
              {publishStatus === 'PENDING_COE' ? 'Submitted to Exam Cell' : publishStatus}
            </Badge>
          </div>
        </div>
      </FacultyPanel>

      <FacultyPanel
        title="Student marks"
        count={rows.length}
        description="Enter marks per student — CO mapping optional"
      >
        <div className="mb-4 flex flex-wrap justify-end gap-2">
          <Button variant="outline" size="sm" disabled={!courseId || saving || !entryAllowed || publishStatus === 'PENDING_COE' || publishStatus === 'PUBLISHED'} onClick={() => void saveDraft()}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
            Save draft
          </Button>
          <Button size="sm" disabled={!courseId || saving || !entryAllowed || publishStatus === 'PENDING_COE' || publishStatus === 'PUBLISHED'} onClick={() => void publish()}>
            <Send className="mr-1 h-4 w-4" />
            Submit to Exam Cell
          </Button>
        </div>

        {loading ? (
          <FacultyInlineLoading label="Loading marks…" />
        ) : !courseId ? (
          <FacultyEmptyState description="Select a course to load the class roster." />
        ) : rosterError ? (
          <FacultyErrorBanner message={rosterError} />
        ) : rows.length === 0 ? (
          <FacultyEmptyState description="No enrolled students found for this course." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs font-medium text-muted-foreground">
                  <th className="pb-2 pr-4">Roll</th>
                  <th className="pb-2 pr-4">Student</th>
                  <th className="pb-2 pr-4">CO</th>
                  <th className="pb-2">Marks</th>
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
                    <td className="py-2.5 pr-4">
                      <Input
                        className="h-8 w-20"
                        placeholder="CO1"
                        defaultValue={row.co_mapped ?? ''}
                        onBlur={(e) =>
                          setRows((prev) =>
                            prev.map((r) =>
                              r.student_user_id === row.student_user_id
                                ? { ...r, co_mapped: e.target.value || null }
                                : r,
                            ),
                          )
                        }
                      />
                    </td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min={0}
                          max={maxMarks}
                          className="h-8 w-24"
                          value={row.marks_obtained ?? ''}
                          onChange={(e) => updateMark(row.student_user_id, e.target.value)}
                        />
                        <span className="text-muted-foreground">/ {maxMarks}</span>
                      </div>
                    </td>
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
