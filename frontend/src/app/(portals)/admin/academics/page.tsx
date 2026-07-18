'use client';

import { Select } from '@/components/ui/select';
import { useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { RegistrarExamIntegrationPanel } from '@/components/admin/RegistrarExamIntegrationPanel';
import { useAuthedApi } from '@/lib/api';

export default function AdminAcademicsPage() {
  const api = useAuthedApi();
  const [semester, setSemester] = useState('4');
  const [courseId, setCourseId] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'merit'>('name');
  const [assigning, setAssigning] = useState(false);
  const [lastAssigned, setLastAssigned] = useState<number | null>(null);

  async function assignRollNumbers() {
    setAssigning(true);
    try {
      const result = await api.post<{ assigned: number }>('/api/academics/enrollments/assign-roll-numbers', {
        semester: Number(semester),
        course_id: courseId.trim() || undefined,
        sort_by: sortBy,
      });
      setLastAssigned(result.assigned);
      toast.success(`Assigned roll numbers 1–${result.assigned}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Roll assignment failed');
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6" data-testid="registrar-academics">
      <div>
        <h1 className="text-2xl font-semibold text-sgvu-navy">Academics & SIS</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Semester roll numbers change each term; PRN is permanent and assigned at admission.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assign semester roll numbers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Rolls are stored per course enrollment for the semester and sorted alphabetically by
            name or by attendance merit. Leave course empty to assign across all enrollments in the
            semester.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium">Semester</span>
              <Input value={semester} onChange={(e) => setSemester(e.target.value)} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Course ID (optional)</span>
              <Input
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                placeholder="UUID for one course section"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Sort by</span>
              <Select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'name' | 'merit')}
              >
                <option value="name">Name (alphabetical)</option>
                <option value="merit">Merit (attendance %)</option>
              </Select>
            </label>
          </div>
          <Button disabled={assigning} onClick={() => void assignRollNumbers()}>
            {assigning ? 'Assigning…' : 'Assign roll numbers 1…N'}
          </Button>
          {lastAssigned != null && (
            <p className="text-sm text-emerald-700">Last run: {lastAssigned} enrollments updated.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center justify-between gap-4 p-4">
          <div>
            <p className="font-medium">Bulk student intake</p>
            <p className="text-sm text-muted-foreground">
              Upload Excel for 2,000+ students with PRN generation and welcome emails.
            </p>
          </div>
          <Button variant="outline" asChild>
            <a href="/admin/students/bulk-upload">Student Excel upload</a>
          </Button>
        </CardContent>
      </Card>

      <RegistrarExamIntegrationPanel compact />
    </div>
  );
}
