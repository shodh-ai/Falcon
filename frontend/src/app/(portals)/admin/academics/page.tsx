'use client';

import { Select } from '@/components/ui/select';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { RegistrarExamIntegrationPanel } from '@/components/admin/RegistrarExamIntegrationPanel';
import { useAuthedApi } from '@/lib/api';
import { cn } from '@/lib/utils';

const BRAND_BTN =
  'border border-[#0B2447] bg-[#0B2447] text-white transition-colors hover:bg-[#123A6D] hover:text-white active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy disabled:opacity-60';

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
    <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-6" data-testid="registrar-academics">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-sgvu-gold">
            Student Information System
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-sgvu-navy sm:text-3xl">
            Academics & SIS
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Semester roll numbers change each term; PRN is permanent and assigned at admission.
          </p>
        </CardContent>
      </Card>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="space-y-5 p-5 md:p-6">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sgvu-gold">
              Enrollment tools
            </p>
            <h2 className="mt-1.5 text-xl font-bold text-sgvu-navy">Assign semester roll numbers</h2>
            <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              Rolls are stored per course enrollment for the semester and sorted alphabetically by
              name or by attendance merit. Leave course empty to assign across all enrollments in
              the semester.
            </p>
          </div>

          <div className="grid gap-4 border-t border-sgvu-navy/10 pt-5 md:grid-cols-3">
            <label className="space-y-1.5 text-sm">
              <span className="font-semibold text-sgvu-navy">Semester</span>
              <Input
                value={semester}
                onChange={(e) => setSemester(e.target.value)}
                className="h-11 rounded-xl border-sgvu-navy/15"
                inputMode="numeric"
                aria-label="Semester"
              />
            </label>
            <label className="space-y-1.5 text-sm md:col-span-2">
              <span className="font-semibold text-sgvu-navy">Course ID (optional)</span>
              <Input
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                placeholder="UUID for one course section"
                className="h-11 rounded-xl border-sgvu-navy/15"
                aria-label="Course ID"
              />
            </label>
            <label className="space-y-1.5 text-sm md:col-span-3">
              <span className="font-semibold text-sgvu-navy">Sort by</span>
              <Select
                className="flex h-11 w-full rounded-xl border border-sgvu-navy/15 bg-white px-3 text-sm text-sgvu-navy outline-none transition focus-visible:ring-2 focus-visible:ring-sgvu-gold/40"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'name' | 'merit')}
                aria-label="Sort by"
              >
                <option value="name">Name (alphabetical)</option>
                <option value="merit">Merit (attendance %)</option>
              </Select>
            </label>
          </div>

          <div className="flex flex-col gap-3 border-t border-sgvu-navy/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="button"
              className={cn('h-11', BRAND_BTN)}
              disabled={assigning}
              onClick={() => void assignRollNumbers()}
            >
              {assigning ? 'Assigning…' : 'Assign roll numbers 1…N'}
            </Button>
            {lastAssigned != null ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
                Last run: {lastAssigned} enrollments updated.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Run assignment after confirming semester and sort order.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between md:p-6">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sgvu-gold">
              Admissions intake
            </p>
            <h2 className="mt-1.5 text-lg font-bold text-sgvu-navy">Bulk student intake</h2>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Upload Excel for 2,000+ students with PRN generation and welcome emails.
            </p>
          </div>
          <Button asChild className={cn('h-11 shrink-0', BRAND_BTN)}>
            <Link href="/admin/students/bulk-upload">Student Excel upload</Link>
          </Button>
        </CardContent>
      </Card>

      <RegistrarExamIntegrationPanel compact />
    </div>
  );
}
