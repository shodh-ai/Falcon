'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuthedApi } from '@/lib/api';
import { Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';

type Student = {
  user_id: string;
  name: string;
  email: string;
  enrollment_no: string;
  attendance_percent: number | null;
  grade_points: number | null;
  status: string;
};

export function CourseEnrolledStudentsModal({
  courseId,
  courseName,
  open,
  onOpenChange,
}: {
  courseId: string | null;
  courseName: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const api = useAuthedApi();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && courseId) {
      setLoading(true);
      api
        .get<Student[]>(`/api/academics/hod/courses/${courseId}/students`)
        .then((data) => setStudents(data))
        .catch((err) => {
          toast.error(err instanceof Error ? err.message : 'Failed to load students');
          setStudents([]);
        })
        .finally(() => setLoading(false));
    } else {
      setStudents([]);
    }
  }, [api, open, courseId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-sgvu-navy">
            Enrolled Students - {courseName}
          </DialogTitle>
        </DialogHeader>

        <div className="mt-4 max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-sgvu-navy" />
            </div>
          ) : students.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No students found for this course in your department.
            </p>
          ) : (
            <div className="rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-sgvu-navy/20 bg-sgvu-navy text-white">
                    <th className="px-4 py-3 font-semibold uppercase tracking-wide text-xs">Name</th>
                    <th className="px-4 py-3 font-semibold uppercase tracking-wide text-xs text-center">Attendance</th>
                    <th className="px-4 py-3 font-semibold uppercase tracking-wide text-xs text-center">Grade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {students.map((s, i) => (
                    <tr key={s.user_id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-sgvu-navy">{s.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.enrollment_no || s.email}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="tabular-nums font-medium text-sgvu-navy">
                          {s.attendance_percent !== null ? `${Number(s.attendance_percent).toFixed(1)}%` : 'N/A'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="tabular-nums font-medium text-sgvu-navy">
                          {s.grade_points !== null ? Number(s.grade_points).toFixed(2) : 'N/A'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
