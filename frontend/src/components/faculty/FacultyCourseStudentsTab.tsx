'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, Users } from 'lucide-react';
import { useAuthedApi } from '@/lib/api';
import { FacultyStudentReport, type FacultyStudentReportData } from '@/components/faculty/FacultyStudentReport';
import { FacultyErrorBanner, FacultyPanel } from '@/components/faculty';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type CourseStudent = { student_id: string; name: string; roll_number: string; email: string | null; section_code?: string | null };

export function FacultyCourseStudentsTab({ courseId }: { courseId: string }) {
  const api = useAuthedApi();
  const [students, setStudents] = useState<CourseStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [report, setReport] = useState<FacultyStudentReportData | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setSelected(null);
    setReport(null);
    void api.get<CourseStudent[]>(`/api/academics/faculty/course/${encodeURIComponent(courseId)}/students`)
      .then(rows => { if (active) setStudents(Array.isArray(rows) ? rows : []); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, courseId]);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    setReport(null);
    setReportError(null);
    setReportLoading(true);
    void api.get<FacultyStudentReportData>(`/api/academics/faculty/workspaces/analytics/students/${encodeURIComponent(selected)}/report?courseId=${encodeURIComponent(courseId)}`)
      .then(value => { if (active) setReport(value); })
      .catch(reason => { if (active) setReportError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (active) setReportLoading(false); });
    return () => { active = false; };
  }, [api, courseId, selected]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? students.filter(student => [student.name, student.roll_number, student.email, student.section_code].some(value => value?.toLowerCase().includes(needle))) : students;
  }, [students, query]);

  return <div className="grid gap-4 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
    <FacultyPanel title="Enrolled students" description="Select a student for their course-linked academic record.">
      <div className="space-y-3">
        <label className="relative block"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" />
          <Input className="pl-9" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search name, roll or section" aria-label="Search enrolled students" />
        </label>
        {error && <FacultyErrorBanner message={error} />}
        {loading ? <p className="text-sm text-muted-foreground">Loading student roster…</p> :
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Users className="h-3.5 w-3.5" />{visible.length} of {students.length} enrolled students</p>}
        <div className="max-h-[580px] space-y-1.5 overflow-y-auto" role="list">
          {!loading && visible.length === 0 && <p className="text-sm text-muted-foreground">No students match this course and search.</p>}
          {visible.map(student => <button key={student.student_id} type="button" role="listitem" onClick={() => setSelected(student.student_id)}
            aria-pressed={selected === student.student_id}
            className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm hover:border-sgvu-gold ${selected === student.student_id ? 'border-sgvu-gold bg-amber-50' : 'border-slate-200 bg-white'}`}>
            <span className="block font-semibold text-sgvu-navy">{student.name}</span>
            <span className="block text-xs text-muted-foreground">{student.roll_number}{student.section_code ? ` · ${student.section_code}` : ''}</span>
          </button>)}
        </div>
      </div>
    </FacultyPanel>
    <div className="min-w-0">
      {!selected ? <FacultyPanel title="Student academic record"><p className="text-sm text-muted-foreground">Choose an enrolled student to view attendance, marks, assignments, progression and approved course conduct records.</p></FacultyPanel> :
        reportLoading ? <FacultyPanel title="Student academic record"><p className="text-sm text-muted-foreground">Loading report…</p></FacultyPanel> :
        reportError ? <FacultyPanel title="Student academic record"><FacultyErrorBanner message={reportError} /><Button className="mt-3" variant="outline" onClick={() => setSelected(null)}>Back to roster</Button></FacultyPanel> :
        report ? <FacultyStudentReport report={report} actions={<Button variant="outline" size="sm" onClick={() => setSelected(null)}>Back to roster</Button>} /> : null}
    </div>
  </div>;
}
