'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Save, Send } from 'lucide-react';
import { FacultyPageHeader } from '@/components/faculty/FacultyPageHeader';
import { useFacultyCourses } from '@/components/faculty/useFacultyCourses';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import Link from 'next/link';

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
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!courseId) {
      setRows([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await api.get<MarksPayload>(
          `/api/academics/faculty/workspaces/marks?courseId=${encodeURIComponent(courseId)}&examType=${examType}`,
        );
        if (!cancelled) {
          setRows(data.rows);
          setMaxMarks(data.max_marks_default ?? 50);
          setPublishStatus(data.publish_status);
        }
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : 'Failed to load marks');
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

  async function saveDraft() {
    if (!courseId) return;
    setSaving(true);
    try {
      await api.post('/api/academics/faculty/workspaces/marks/draft', {
        course_id: courseId,
        exam_type: examType,
        max_marks: maxMarks,
        entries: rows
          .filter((r) => r.marks_obtained !== null)
          .map((r) => ({
            student_user_id: r.student_user_id,
            marks_obtained: r.marks_obtained,
            co_mapped: r.co_mapped,
          })),
      });
      toast.success('Draft saved');
      setPublishStatus('DRAFT');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (!courseId) return;
    setSaving(true);
    try {
      await saveDraft();
      await api.post('/api/academics/faculty/workspaces/marks/publish', {
        course_id: courseId,
        exam_type: examType,
      });
      toast.success('Marks published to students');
      setPublishStatus('PUBLISHED');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <FacultyPageHeader
        title="Examinations & Grading"
        description="Spreadsheet-style marks entry with max-marks validation. Link assessments to COs via CO-PO Mapping."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/faculty/grading/copo">CO-PO Mapping</Link>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assessment setup</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Course</span>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
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
            <span className="mb-1 block font-medium">Assessment type</span>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={examType}
              onChange={(e) => setExamType(e.target.value as (typeof EXAM_TYPES)[number])}
            >
              {EXAM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Max marks</span>
            <Input
              type="number"
              min={1}
              value={maxMarks}
              onChange={(e) => setMaxMarks(Number(e.target.value) || 50)}
            />
          </label>
          <div className="flex items-end gap-2">
            <Badge variant={publishStatus === 'PUBLISHED' ? 'default' : 'secondary'}>
              {publishStatus}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Student marks</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={!courseId || saving} onClick={() => void saveDraft()}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
              Save draft
            </Button>
            <Button size="sm" disabled={!courseId || saving} onClick={() => void publish()}>
              <Send className="mr-1 h-4 w-4" />
              Publish to students
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-sgvu-navy" />
            </div>
          ) : !courseId ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Select a course to load the class roster.</p>
          ) : (
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-4">Roll / ID</th>
                  <th className="pb-2 pr-4">Student</th>
                  <th className="pb-2 pr-4">CO</th>
                  <th className="pb-2">Marks</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.student_user_id} className="border-b border-border/40">
                    <td className="py-2 pr-4 font-mono text-xs">{row.roll_number}</td>
                    <td className="py-2 pr-4">{row.name}</td>
                    <td className="py-2 pr-4">
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
                    <td className="py-2">
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
