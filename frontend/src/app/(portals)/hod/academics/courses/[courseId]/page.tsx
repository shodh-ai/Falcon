'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Bell, BookOpen, Users } from 'lucide-react';
import { HodMetricChip, HodPageFrame, HodPageHeader, HodPanel } from '@/components/hod/HodPagePrimitives';
import { useAuthedApi } from '@/lib/api';
import type { FacultyWorkspace, FacultyAssignment } from '@/lib/api/lms';
import type { FacultyCourse } from '@/components/faculty/useFacultyCourses';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/notifications/falcon-toast';

type StudentRow = { user_id: string; name: string; student_login_id?: string | null; status: string };

export default function HodCourseWorkspacePage() {
  const { courseId } = useParams<{ courseId: string }>();
  const api = useAuthedApi();
  const [workspace, setWorkspace] = useState<FacultyWorkspace | null>(null);
  const [allocations, setAllocations] = useState<FacultyCourse[]>([]);
  const [assignments, setAssignments] = useState<FacultyAssignment[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [recipient, setRecipient] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const id = encodeURIComponent(courseId);
      const [overview, courses, assignmentRows, studentRows] = await Promise.all([
        api.get<FacultyWorkspace>(`/api/academics/hod/courses/${id}/oversight`),
        api.get<FacultyCourse[]>('/api/academics/faculty/workspaces/courses?scope=department'),
        api.get<FacultyAssignment[]>(`/api/academics/faculty/assignments?courseId=${id}`),
        api.get<StudentRow[]>(`/api/academics/hod/courses/${id}/students`),
      ]);
      setWorkspace(overview);
      setAllocations((Array.isArray(courses) ? courses : []).filter((row) => row.course_id === courseId));
      setAssignments(Array.isArray(assignmentRows) ? assignmentRows : []);
      setStudents(Array.isArray(studentRows) ? studentRows : []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load department course');
    } finally {
      setLoading(false);
    }
  }, [api, courseId]);

  useEffect(() => { void load(); }, [load]);
  const faculty = useMemo(() => [...new Map(allocations.filter((row) => row.faculty_user_id).map((row) => [row.faculty_user_id!, row.faculty_name || 'Assigned faculty'])).entries()], [allocations]);

  async function sendNote() {
    if (!recipient || !message.trim()) return;
    setSending(true);
    try {
      await api.post(`/api/academics/hod/courses/${encodeURIComponent(courseId)}/faculty/${encodeURIComponent(recipient)}/notification`, { message: message.trim() });
      toast.success('Notification sent to faculty');
      setMessage('');
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'Could not send notification');
    } finally {
      setSending(false);
    }
  }

  return <HodPageFrame>
    <HodPageHeader title={workspace ? `${workspace.course.course_code} · ${workspace.course.course_name}` : 'Course overview'}
      description="Department oversight is read-only. The assigned faculty manages course content in their own workspace."
      actions={<Link href="/hod/academics/courses" className="inline-flex items-center gap-2 text-sm font-semibold text-sgvu-navy hover:underline"><ArrowLeft className="h-4 w-4" />All department courses</Link>}
      meta={workspace ? <><HodMetricChip label="Faculty" value={faculty.length} /><HodMetricChip label="Department students" value={students.filter((student) => student.status === 'ENROLLED').length} /><HodMetricChip label="Units" value={workspace.modules.length} /><HodMetricChip label="Assignments" value={assignments.length} /></> : null} />
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {loading ? <p className="p-4 text-sm text-muted-foreground">Loading course overview…</p> : workspace && <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5">
        <HodPanel title="Teaching assignments" count={allocations.filter((row) => row.allocation_id).length}>
          {allocations.filter((row) => row.allocation_id).length ? <ul className="divide-y divide-slate-100">{allocations.filter((row) => row.allocation_id).map((row) => <li key={row.allocation_id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span className="font-semibold text-sgvu-navy">{row.faculty_name || 'Faculty unassigned'}</span><span className="text-slate-600">{row.program_name || 'Programme unspecified'} · Semester {row.semester || '—'} · {row.academic_year || 'Year unspecified'}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">No active faculty allocation.</p>}
        </HodPanel>
        <HodPanel title="Syllabus and materials" count={workspace.modules.length}>
          {workspace.modules.length ? <div className="space-y-3">{workspace.modules.map((module) => <div key={module.module_id} className="rounded-lg border border-slate-200 p-4"><h2 className="font-semibold text-sgvu-navy">Unit {module.module_number}: {module.title}</h2><p className="mt-1 text-xs text-slate-500">{module.status.replaceAll('_', ' ')}</p>{module.description && <p className="mt-2 text-sm text-slate-700">{module.description}</p>}<ul className="mt-3 space-y-1">{module.materials.map((material) => <li key={material.material_id} className="flex items-center gap-2 text-sm text-slate-700"><BookOpen className="h-4 w-4 shrink-0 text-sgvu-gold" />{material.title} <span className="text-xs text-slate-500">({material.material_type})</span></li>)}</ul></div>)}</div> : <p className="text-sm text-muted-foreground">No syllabus units configured.</p>}
        </HodPanel>
        <HodPanel title="Assignments" count={assignments.length}>{assignments.length ? <ul className="divide-y divide-slate-100">{assignments.map((assignment) => <li key={assignment.assignment_id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span className="font-medium text-sgvu-navy">{assignment.title}</span><span className="text-slate-600">Due {new Date(assignment.due_date).toLocaleDateString('en-IN')} · {assignment.submission_count ?? 0} submissions</span></li>)}</ul> : <p className="text-sm text-muted-foreground">No assignments published.</p>}</HodPanel>
      </div>
      <div className="space-y-5">
        <HodPanel title="Enrolled department students" count={students.filter((student) => student.status === 'ENROLLED').length}><div className="max-h-80 overflow-y-auto">{students.filter((student) => student.status === 'ENROLLED').length ? <ul className="divide-y divide-slate-100">{students.filter((student) => student.status === 'ENROLLED').map((student) => <li key={student.user_id} className="flex items-center gap-2 py-2 text-sm"><Users className="h-4 w-4 shrink-0 text-slate-400" /><span>{student.name}</span><span className="ml-auto text-xs text-slate-500">{student.student_login_id}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">No active department enrollments for this course.</p>}</div></HodPanel>
        <HodPanel title="Notify assigned faculty">
          <p className="mb-3 text-sm text-slate-600">Send an academic note. This does not alter the faculty workspace.</p>
          <label htmlFor="hod-notify-recipient" className="block text-sm font-medium text-sgvu-navy">Faculty member</label>
          <select id="hod-notify-recipient" className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-sm" value={recipient} onChange={(event) => setRecipient(event.target.value)}><option value="">Select faculty</option>{faculty.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
          <label htmlFor="hod-notify-message" className="mt-3 block text-sm font-medium text-sgvu-navy">Message</label>
          <textarea id="hod-notify-message" maxLength={1000} rows={4} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Write the note to this faculty member" />
          <Button className="mt-3" onClick={() => void sendNote()} disabled={sending || !recipient || !message.trim()}><Bell className="mr-2 h-4 w-4" />Send notification</Button>
        </HodPanel>
      </div>
    </div>}
  </HodPageFrame>;
}
