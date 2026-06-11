'use client';

import { useEffect, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export default function TimetableBuilderPage() {
  const api = useAuthedApi();
  const [form, setForm] = useState({
    room_code: '402',
    day_of_week: 'MON',
    start_time: '10:00',
    end_time: '11:00',
    course_code: 'CSE101',
    faculty_user_id: 'b0000003-0000-4000-8000-000000000003',
    academic_year: '2026-27',
  });

  const save = async () => {
    try {
      await api.post('/api/admin-ops/timetable', form);
      toast.success('Slot saved — clash matrix passed');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Clash detected or save failed');
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-sgvu-navy">AI Timetable Clash-Resolver</h1>
      <p className="text-sm text-muted-foreground">
        Hard blocks on room double-booking, faculty overlap, and UGC 16 hr/week workload limit.
      </p>
      <div className="mt-6 grid max-w-lg gap-3">
        {Object.entries(form).map(([key, val]) => (
          <label key={key} className="grid gap-1 text-sm">
            <span className="font-medium capitalize">{key.replace(/_/g, ' ')}</span>
            <Input value={val} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
          </label>
        ))}
        <Button onClick={() => void save()}>Assign Slot</Button>
      </div>
    </div>
  );
}
