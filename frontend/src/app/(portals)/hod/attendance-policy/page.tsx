'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Search, Edit2, Check, X, RotateCcw } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';
import type { ThresholdRequest } from '@/lib/attendance-policy';

function statusVariant(status: ThresholdRequest['status']) {
  if (status === 'APPROVED') return 'success' as const;
  if (status === 'REJECTED') return 'destructive' as const;
  return 'secondary' as const;
}

export default function HodAttendancePolicyPage() {
  interface Course {
    course_id: string;
    course_code: string;
    course_name: string;
    credits: number;
    is_elective: boolean;
    min_attendance: number | null;
    semester: number;
    faculty_name: string | null;
  }

  const api = useAuthedApi();
  const [rows, setRows] = useState<ThresholdRequest[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  // States for Department Threshold Request (Dean Approval)
  const [deptPercent, setDeptPercent] = useState('75');
  const [deptReason, setDeptReason] = useState('');
  const [deptSubmitting, setDeptSubmitting] = useState(false);

  // States for Subject Overrides
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSemester, setSelectedSemester] = useState<string>('ALL');
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [updatingCourseId, setUpdatingCourseId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [requestsData, coursesData] = await Promise.all([
        api.get<ThresholdRequest[]>('/api/attendance-policy/hod/threshold-requests'),
        api.get<Course[]>('/api/attendance-policy/hod/courses'),
      ]);
      setRows(Array.isArray(requestsData) ? requestsData : []);
      setCourses(Array.isArray(coursesData) ? coursesData : []);

      // Set direct input default to currently active approved policy or 75
      const activeThreshold = requestsData.find((r) => r.status === 'APPROVED')?.requested_min_percent ?? 75;
      setDeptPercent(String(activeThreshold));
    } catch {
      setRows([]);
      setCourses([]);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const activeDeptThreshold = rows.find((r) => r.status === 'APPROVED')?.requested_min_percent ?? 75;

  // Department threshold change — routed to Dean for approval
  async function submitDepartmentRequest() {
    const pct = Number(deptPercent);
    if (!Number.isFinite(pct) || pct < 1 || pct > 100) {
      toast.error('Enter a percentage between 1 and 100');
      return;
    }
    if (!deptReason.trim()) {
      toast.error('A justification is required');
      return;
    }
    setDeptSubmitting(true);
    try {
      await api.post('/api/attendance-policy/hod/threshold-requests', {
        requested_min_percent: pct,
        reason: deptReason.trim(),
      });
      toast.success('Request sent to Dean for approval');
      setDeptReason('');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Submission failed');
    } finally {
      setDeptSubmitting(false);
    }
  }

  // Update subject-specific override
  async function submitSubjectOverride(courseId: string, val: string | null) {
    let min_attendance: number | null = null;
    if (val !== null) {
      const pct = Number(val);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        toast.error('Threshold must be between 0 and 100');
        return;
      }
      min_attendance = pct;
    }
    setUpdatingCourseId(courseId);
    try {
      await api.post(`/api/attendance-policy/hod/courses/${courseId}/threshold`, {
        min_attendance,
      });
      toast.success('Subject-level attendance threshold updated');
      setEditingCourseId(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update course policy');
    } finally {
      setUpdatingCourseId(null);
    }
  }

  const filteredCourses = courses.filter(
    (c) =>
      (selectedSemester === 'ALL' || String(c.semester) === selectedSemester) &&
      (c.course_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.course_name.toLowerCase().includes(searchQuery.toLowerCase())),
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold text-sgvu-navy">Attendance Policy Configuration</h1>
        <p className="text-sm text-muted-foreground">
          Request department-wide attendance threshold changes (Dean approval required) or set subject-level overrides.
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">Department Threshold Request</CardTitle>
          <CardDescription>
            Propose a new minimum attendance percentage for your department. The request is sent to the Dean Office for
            sign-off before it takes effect.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-500">Requested Minimum Attendance %</label>
              <div className="mt-1 flex items-center gap-2">
                <Input
                  type="number"
                  value={deptPercent}
                  onChange={(e) => setDeptPercent(e.target.value)}
                  className="w-28 text-center font-semibold text-slate-800"
                  min="1"
                  max="100"
                />
                <span className="text-sm font-medium text-slate-600">%</span>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Justification</label>
              <textarea
                className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
                rows={3}
                placeholder="e.g. Medical outbreak, severe weather disruptions, industry internship season"
                value={deptReason}
                onChange={(e) => setDeptReason(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center justify-between border-t pt-4">
            <span className="text-xs text-muted-foreground">
              Current active default: <strong className="text-sgvu-navy">{activeDeptThreshold}%</strong>
            </span>
            <Button onClick={() => void submitDepartmentRequest()} disabled={deptSubmitting}>
              {deptSubmitting ? 'Submitting…' : 'Send to Dean'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Subject-Specific Policies (Overrides) */}
      <Card>
        <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3">
          <div>
            <CardTitle className="text-base">Subject-Specific Policy Overrides</CardTitle>
            <CardDescription>Set different minimum attendance thresholds for specific subjects.</CardDescription>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {['ALL', '1', '2', '3', '4', '5', '6', '7', '8'].map((sem) => (
                <Button
                  key={sem}
                  size="sm"
                  variant={selectedSemester === sem ? 'default' : 'outline'}
                  className="h-8 text-xs font-semibold px-2.5"
                  onClick={() => setSelectedSemester(sem)}
                >
                  {sem === 'ALL' ? 'All Semesters' : `Sem ${sem}`}
                </Button>
              ))}
            </div>
          </div>
          <div className="relative w-full md:w-64 self-end md:self-auto">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search subjects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading subjects…
            </div>
          ) : filteredCourses.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground">No subjects found.</div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3">Subject Code</th>
                    <th className="px-4 py-3">Subject Name</th>
                    <th className="px-4 py-3">Semester</th>
                    <th className="px-4 py-3">Allocated Faculty</th>
                    <th className="px-4 py-3">Credits</th>
                    <th className="px-4 py-3">Attendance Requirement</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredCourses.map((c) => {
                    const isEditing = editingCourseId === c.course_id;
                    const hasOverride = c.min_attendance !== null && c.min_attendance !== undefined;
                    return (
                      <tr key={c.course_id} className="hover:bg-muted/10">
                        <td className="px-4 py-3 font-semibold text-sgvu-navy">{c.course_code}</td>
                        <td className="px-4 py-3 font-medium">{c.course_name}</td>
                        <td className="px-4 py-3 font-medium text-slate-600">Sem {c.semester}</td>
                        <td className="px-4 py-3 text-slate-700 font-medium">
                          {c.faculty_name ? (
                            <span className="text-slate-800 font-semibold">{c.faculty_name}</span>
                          ) : (
                            <span className="text-slate-400 italic text-xs font-normal">Not Allocated</span>
                          )}
                        </td>
                        <td className="px-4 py-3">{c.credits}</td>
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                className="w-16 h-8 text-center text-xs font-bold"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                min="0"
                                max="100"
                                autoFocus
                              />
                              <span className="text-xs font-medium text-slate-500">%</span>
                            </div>
                          ) : hasOverride ? (
                            <Badge className="bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-medium">
                              {c.min_attendance}% (Override)
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground font-medium">
                              Inherited default ({activeDeptThreshold}%)
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {updatingCourseId === c.course_id ? (
                            <Loader2 className="h-4 w-4 animate-spin inline" />
                          ) : isEditing ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                onClick={() => void submitSubjectOverride(c.course_id, editValue)}
                                title="Save"
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              {hasOverride && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                  onClick={() => void submitSubjectOverride(c.course_id, null)}
                                  title="Clear Override"
                                >
                                  <RotateCcw className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-slate-500 hover:text-slate-600 hover:bg-slate-50"
                                onClick={() => setEditingCourseId(null)}
                                title="Cancel"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs font-medium"
                              onClick={() => {
                                setEditingCourseId(c.course_id);
                                setEditValue(hasOverride ? String(c.min_attendance) : String(activeDeptThreshold));
                              }}
                            >
                              <Edit2 className="h-3 w-3 mr-1" /> Configure
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Formal Requests History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dean Request History</CardTitle>
          <CardDescription>History of formal threshold adjustment requests sent to the Dean Office.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading requests…
            </p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No requests yet.</p>
          ) : (
            rows.map((r) => (
              <div key={r.request_id} className="flex items-center justify-between rounded-lg border px-4 py-3 text-sm">
                <div>
                  <span className="font-semibold text-slate-700">Minimum {r.requested_min_percent}%</span>
                  <span className="text-muted-foreground"> · {r.dept_name ?? 'Department'}</span>
                  <p className="text-xs text-slate-500 mt-1 italic">Reason: &quot;{r.reason}&quot;</p>
                  {r.decision_remarks ? (
                    <p className="text-xs font-medium text-sgvu-navy mt-1">Dean Decision Remarks: {r.decision_remarks}</p>
                  ) : null}
                </div>
                <Badge variant={statusVariant(r.status)}>
                  {r.status === 'PENDING_DEAN' ? 'With Dean' : r.status === 'APPROVED' ? 'Approved' : 'Rejected'}
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
