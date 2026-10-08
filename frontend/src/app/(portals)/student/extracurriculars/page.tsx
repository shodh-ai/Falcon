'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Activity } from 'lucide-react';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentSectionCard } from '@/components/student/StudentSectionCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';
import { toast } from '@/lib/notifications/falcon-toast';

const ACTIVITY_TYPES = ['NCC', 'NSS', 'SODECA', 'OTHER'] as const;

export default function ExtracurricularsLogPage() {
  const api = useAuthedApi();
  const router = useRouter();
  const [activityType, setActivityType] = useState<(typeof ACTIVITY_TYPES)[number]>('NCC');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!description.trim() || !eventDate || !file) {
      toast.error('Activity type, description, date, and certificate file are required');
      return;
    }
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append('activity_type', activityType);
      form.append('description', description.trim());
      form.append('event_date', eventDate);
      form.append('file', file);
      await api.post('/api/student/extracurriculars', form);
      toast.success('Activity submitted for verification');
      router.push('/student/falcon-events?tab=points');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not submit activity');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <StudentPageShell width="4xl">
      <StudentPageHeader
        title="Log extracurricular activity"
        description="Upload NCC / NSS / SODECA certificates to earn activity points after verification."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/student/falcon-events?tab=points">Back to points</Link>
          </Button>
        }
      />

      <StudentSectionCard title="New activity" icon={Activity}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Activity type
            </label>
            <select
              className="mt-2 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
              value={activityType}
              onChange={(e) => setActivityType(e.target.value as (typeof ACTIVITY_TYPES)[number])}
            >
              {ACTIVITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Event date
            </label>
            <Input
              className="mt-2"
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Description
            </label>
            <Input
              className="mt-2"
              placeholder="e.g. Republic Day parade — NCC contingent"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Certificate (PDF / JPG / PNG)
            </label>
            <Input
              className="mt-2"
              type="file"
              accept=".pdf,image/jpeg,image/png"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>
        <Button className="mt-4" disabled={submitting} onClick={() => void submit()}>
          {submitting ? 'Submitting…' : 'Submit for verification'}
        </Button>
      </StudentSectionCard>
    </StudentPageShell>
  );
}
