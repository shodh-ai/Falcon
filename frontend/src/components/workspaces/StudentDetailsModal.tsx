'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { departmentDisplayName } from '@/lib/department-display';
import { useAuthedApi } from '@/lib/api';
import { Loader2, Briefcase, AlertCircle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export function StudentDetailsModal({
  studentId,
  open,
  onOpenChange,
  portal,
}: {
  studentId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  portal?: 'hod' | 'dean';
}) {
  const api = useAuthedApi();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setData(null); setError(null);
    if (open && studentId) {
      setLoading(true);
      const prefix = portal === 'dean' ? 'dean' : 'hod';
      api.get(`/api/academics/${prefix}/student-monitor/${studentId}/detail`)
        .then(result => { if (active) setData(result); })
        .catch(err => { if (active) setError(err instanceof Error ? err.message : 'Could not load student record'); })
        .finally(() => { if (active) setLoading(false); });
    } else {
      setData(null);
    }
    return () => { active = false; };
  }, [open, studentId, api, portal, retry]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl bg-white">
        <DialogHeader className="border-b pb-4 pr-12">
          <DialogTitle className="text-xl font-bold text-sgvu-navy">
            {data?.student_name || 'Student Academic Details'}
          </DialogTitle>
          {data?.student_name && (
            <DialogDescription>{departmentDisplayName(data.department)} · {data.student_email || 'Academic record'}</DialogDescription>
          )}
        </DialogHeader>

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-sgvu-navy" />
          </div>
        ) : error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"><p>{error}</p><Button className="mt-3" variant="outline" onClick={() => setRetry(n => n + 1)}>Try again</Button></div> : !data ? null : (
          <div className="space-y-6 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex-1 rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  Active Backlogs
                </div>
                <div className={`mt-2 text-3xl font-black ${data.active_backlogs > 0 ? 'text-red-500' : 'text-slate-800'}`}>
                  {data.active_backlogs}
                </div>
              </div>
              <div className="flex-1 rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                  <Briefcase className="h-4 w-4 text-emerald-500" />
                  Placement Status
                </div>
                <div className={`mt-2 text-xl font-bold ${data.placement ? 'text-emerald-600' : 'text-slate-500'}`}>
                  {data.placement ? `Placed at ${data.placement.company_name}` : 'No placement recorded'}
                </div>
              </div>
            </div>

            <section className="overflow-hidden rounded-xl border"><h3 className="border-b bg-slate-50 px-4 py-3 font-semibold">Courses and attendance</h3>
              {data.current_courses?.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b text-xs text-slate-500"><tr><th className="p-3">Course</th><th className="p-3">Semester</th><th className="p-3">Enrollment</th><th className="p-3">Attendance</th></tr></thead><tbody>{data.current_courses.map((course: { course_code: string; course_name: string; semester: number; status: string; attendance_percent: number | null }, i: number) => <tr key={`${course.course_code}-${i}`} className="border-b last:border-0"><td className="p-3"><strong>{course.course_code}</strong><p className="text-slate-500">{course.course_name}</p></td><td className="p-3">{course.semester}</td><td className="p-3">{String(course.status ?? 'Not recorded').replaceAll('_', ' ')}</td><td className="p-3 tabular-nums">{course.attendance_percent == null ? 'Not recorded' : `${Number(course.attendance_percent).toFixed(1)}%`}</td></tr>)}</tbody></table></div> : <p className="p-5 text-sm text-slate-500">No course records are available.</p>}
            </section>
            {data.semester_history?.length > 0 ? (
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 p-4 shadow-sm">
                  <h4 className="mb-4 text-sm font-bold text-slate-600">Completed semester grade averages</h4>
                  <div className="h-48 w-full">
                    <ResponsiveContainer>
                      <LineChart data={data.semester_history} margin={{ left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="semester" tickFormatter={(v) => `Sem ${v}`} style={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                        <YAxis domain={[0, 10]} style={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                        <Tooltip 
                          contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        />
                        <Line type="monotone" dataKey="cgpa" name="CGPA" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6' }} activeDot={{ r: 6 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 p-4 shadow-sm">
                  <h4 className="mb-4 text-sm font-bold text-slate-600">Attendance Trend</h4>
                  <div className="h-48 w-full">
                    <ResponsiveContainer>
                      <LineChart data={data.semester_history} margin={{ left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="semester" tickFormatter={(v) => `Sem ${v}`} style={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                        <YAxis domain={[0, 100]} style={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                        <Tooltip 
                          contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        />
                        <Line type="monotone" dataKey="attendance" name="Attendance %" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981' }} activeDot={{ r: 6 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center text-sm text-slate-500 py-8 border border-slate-200 rounded-xl bg-slate-50">
                No completed semester history yet. Current course records are shown above.
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
