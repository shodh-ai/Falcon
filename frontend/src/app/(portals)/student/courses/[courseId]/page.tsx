'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useAuthedApi } from '@/lib/api';
import { API_URL } from '@/lib/api/client';
import { useAuth } from '@/context/AuthContext';

type ModuleRow = {
  module_id: string;
  module_number: number;
  title: string;
  status: string;
  materials: { material_id: string; title: string; material_type: string }[];
};

type Workspace = {
  course: { course_code: string; course_name: string };
  enrollment: { attendance_percent: number; semester: number };
  syllabus_progress: { completed: number; total: number; percent: number };
  modules: ModuleRow[];
  assignments: { assignment: { assignment_id: string; title: string; due_date: string }; status: string }[];
};

function statusIcon(status: string) {
  if (status === 'COMPLETED') return '🟢';
  if (status === 'IN_PROGRESS') return '🟠';
  return '⚪';
}

export default function StudentCourseWorkspacePage() {
  const { courseId } = useParams<{ courseId: string }>();
  const api = useAuthedApi();
  const { token } = useAuth();
  const [data, setData] = useState<Workspace | null>(null);

  const load = useCallback(() => {
    if (!courseId) return;
    void api.get<Workspace>(`/api/academics/student/courses/${courseId}/workspace`).then(setData);
  }, [api, courseId]);

  useEffect(() => {
    load();
  }, [load]);

  async function downloadMaterial(materialId: string, title: string) {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/academics/student/courses/materials/${materialId}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    }
  }

  if (!data) {
    return <p className="p-8 text-center text-sm text-muted-foreground">Loading course…</p>;
  }

  const { syllabus_progress: sp } = data;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <StudentPageHeader
        title={`${data.course.course_code} — ${data.course.course_name}`}
        description="Syllabus progress, module materials, attendance, and digital assignments for this subject."
        actions={
          <Link href="/student/registration" className="text-sm font-medium text-sgvu-navy underline">
            My subjects
          </Link>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Syllabus coverage</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-2 text-sm font-medium">
            {sp.percent}% ({sp.completed}/{sp.total} modules completed)
          </p>
          <Progress value={sp.percent} className="h-3" />
          <p className="mt-3 text-sm text-muted-foreground">
            Your attendance in this subject: <strong>{data.enrollment.attendance_percent}%</strong>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Module timeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 border-l-2 border-sgvu-gold/40 pl-4">
          {data.modules.map((mod) => (
            <div key={mod.module_id} className="relative">
              <p className="font-medium">
                {statusIcon(mod.status)} Module {mod.module_number}: {mod.title}
              </p>
              <p className="text-xs text-muted-foreground">{mod.status.replace('_', ' ')}</p>
              {mod.status === 'COMPLETED' &&
                mod.materials.map((m) => (
                  <Button
                    key={m.material_id}
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={() => void downloadMaterial(m.material_id, m.title)}
                  >
                    Download {m.material_type} — {m.title}
                  </Button>
                ))}
            </div>
          ))}
          {!data.modules.length && (
            <p className="text-sm text-muted-foreground">Faculty has not published the syllabus yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Digital assignments (DA)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {data.assignments.map((row) => (
            <div key={row.assignment.assignment_id} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="font-medium">{row.assignment.title}</p>
                <p className="text-xs text-muted-foreground">
                  Due {new Date(row.assignment.due_date).toLocaleDateString()}
                </p>
              </div>
              <Badge variant="secondary">{row.status}</Badge>
            </div>
          ))}
          {!data.assignments.length && (
            <p className="text-muted-foreground">No active assignments for this course.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
