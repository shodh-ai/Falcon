'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import {
  HodPageFrame,
  HodPageHeader,
  HodTableHead,
  HodTableWrap,
} from '@/components/hod/HodPagePrimitives';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';
import { Select } from '@/components/ui/select';

type UnassignedItem = {
  allocation_id: string;
  subject_code: string;
  subject_name: string;
  subject_type: string;
  credits: number;
  program_name: string;
  semester: string;
  academic_year: string;
};

type FacultyOption = { user_id: string; name: string; email: string };

export default function HodTeachingLoadPage() {
  const api = useAuthedApi();
  const [items, setItems] = useState<UnassignedItem[]>([]);
  const [faculty, setFaculty] = useState<FacultyOption[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await api.get<{ items: UnassignedItem[]; faculty: FacultyOption[] }>(
        '/api/academics/hod/teaching-load/unassigned',
      );
      setItems(data.items);
      setFaculty(data.faculty);
      setDraft({});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load teaching load');
      setItems([]);
      setFaculty([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [api]);

  const facultyById = useMemo(
    () => new Map(faculty.map((f) => [f.user_id, f.name])),
    [faculty],
  );

  async function assign(allocationId: string) {
    const facultyUserId = draft[allocationId];
    if (!facultyUserId) {
      toast.error('Select a faculty member');
      return;
    }
    setSavingId(allocationId);
    try {
      await api.patch(`/api/academics/hod/teaching-load/${allocationId}/assign`, {
        faculty_user_id: facultyUserId,
      });
      toast.success(`Assigned to ${facultyById.get(facultyUserId) ?? 'faculty'}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Assignment failed');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <HodPageFrame>
      <HodPageHeader
        title="Unassigned Teaching Load"
        description="Subjects uploaded with NF (No Faculty) from the Course Allocation Matrix. Assign faculty to push courses to their Faculty Portal and mobile app instantly."
        meta={
          !loading && items.length > 0 ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-red-600">
              <AlertTriangle className="h-4 w-4" />
              {items.length} subject{items.length === 1 ? '' : 's'} unassigned
            </span>
          ) : null
        }
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/hod/academics/course-allocation">Timetable allocation</Link>
          </Button>
        }
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-8 text-center text-sm text-emerald-800">
          All teaching load rows have faculty assigned. Nothing pending.
        </div>
      ) : (
        <HodTableWrap>
          <table className="w-full text-sm">
            <HodTableHead columns={['Subject', 'Program / Semester', 'Year', 'Assign faculty', '']} />
            <tbody className="divide-y divide-border/60">
              {items.map((item) => (
                <tr key={item.allocation_id} className="bg-red-50/30">
                  <td className="px-4 py-3">
                    <p className="font-medium text-sgvu-navy">{item.subject_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.subject_code} · {item.subject_type} · {item.credits} cr
                    </p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {item.program_name}
                    <br />
                    {item.semester}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{item.academic_year}</td>
                  <td className="px-4 py-3">
                    <Select
                      className="w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={draft[item.allocation_id] ?? ''}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          [item.allocation_id]: e.target.value,
                        }))
                      }
                    >
                      <option value="">Select faculty…</option>
                      {faculty.map((f) => (
                        <option key={f.user_id} value={f.user_id}>
                          {f.name}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="sm"
                      disabled={savingId === item.allocation_id}
                      onClick={() => void assign(item.allocation_id)}
                    >
                      {savingId === item.allocation_id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Assign'
                      )}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </HodTableWrap>
      )}
    </HodPageFrame>
  );
}
