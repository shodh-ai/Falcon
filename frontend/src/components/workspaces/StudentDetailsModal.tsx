'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuthedApi } from '@/lib/api';
import { Loader2, Briefcase, AlertCircle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export function StudentDetailsModal({
  studentId,
  open,
  onOpenChange,
}: {
  studentId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const api = useAuthedApi();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (open && studentId) {
      setLoading(true);
      api.get(`/api/academics/hod/student-monitor/${studentId}/detail`)
        .then(setData)
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      setData(null);
    }
  }, [open, studentId, api]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-white">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-sgvu-navy">
            Student Academic Details
          </DialogTitle>
          {data?.student_name && (
            <p className="text-sm text-slate-500">
              {data.student_name} ({data.department})
            </p>
          )}
        </DialogHeader>

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-sgvu-navy" />
          </div>
        ) : !data ? null : (
          <div className="space-y-6 py-4">
            <div className="flex gap-4">
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
                  {data.placement ? `Placed at ${data.placement.company_name}` : 'Not Placed'}
                </div>
              </div>
            </div>

            {data.semester_history?.length > 0 ? (
              <div className="grid grid-cols-2 gap-6">
                <div className="rounded-xl border border-slate-200 p-4 shadow-sm">
                  <h4 className="mb-4 text-sm font-bold text-slate-600">CGPA Trend</h4>
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
                No academic history available for this student yet.
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
