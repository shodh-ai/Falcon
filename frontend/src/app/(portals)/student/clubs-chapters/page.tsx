'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BookOpen, Loader2, Send, Users } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentTabBar } from '@/components/student/StudentTabBar';
import { StudentLoadingState } from '@/components/student/StudentLoadingState';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useAuthedApi } from '@/lib/api';
import { createCampusEventsApi, type CampusClubDirectoryRow } from '@/lib/api/api.campus-events';

type FilterTab = 'all' | 'clubs' | 'chapters';

function statusBadge(row: CampusClubDirectoryRow) {
  if (row.application_status === 'APPROVED') {
    return <Badge variant="success">Member</Badge>;
  }
  if (row.application_status === 'PENDING') {
    return <Badge variant="warning">Application pending</Badge>;
  }
  if (row.application_status === 'REJECTED') {
    return <Badge variant="destructive">Not selected — reapply</Badge>;
  }
  if (!row.applications_open) {
    return <Badge variant="secondary">Applications closed</Badge>;
  }
  return <Badge className="bg-emerald-600 hover:bg-emerald-600">Applications open</Badge>;
}

function ClubCard({
  row,
  onApply,
}: {
  row: CampusClubDirectoryRow;
  onApply: (row: CampusClubDirectoryRow) => void;
}) {
  const canApply =
    row.applications_open &&
    row.application_status !== 'PENDING' &&
    row.application_status !== 'APPROVED';

  return (
    <article className="flex h-full flex-col rounded-2xl border border-border/70 bg-white p-5 shadow-sm transition hover:border-sgvu-gold/40 hover:shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold text-sgvu-navy">{row.name}</h3>
            <Badge variant="outline" className="text-[10px] uppercase">
              {row.club_type === 'CHAPTER' ? 'Chapter' : 'Club'}
            </Badge>
          </div>
          {row.focus_area ? (
            <p className="mt-1 text-xs font-medium text-sgvu-gold">{row.focus_area}</p>
          ) : null}
        </div>
        {statusBadge(row)}
      </div>

      <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">
        {row.description?.trim() || 'Campus group — details coming soon.'}
      </p>

      <dl className="mt-4 space-y-1.5 text-xs text-muted-foreground">
        {row.faculty_advisor_name ? (
          <div className="flex justify-between gap-2">
            <dt>Faculty advisor</dt>
            <dd className="font-medium text-sgvu-navy">{row.faculty_advisor_name}</dd>
          </div>
        ) : null}
        {row.coordinator_name ? (
          <div className="flex justify-between gap-2">
            <dt>Student coordinator</dt>
            <dd className="font-medium text-sgvu-navy">{row.coordinator_name}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-2">
          <dt>Active members</dt>
          <dd className="font-medium text-sgvu-navy">{row.member_count}</dd>
        </div>
      </dl>

      <div className="mt-4 border-t border-border/50 pt-4">
        {canApply ? (
          <Button className="w-full bg-sgvu-navy" onClick={() => onApply(row)}>
            Apply to join
          </Button>
        ) : row.application_status === 'REJECTED' && row.applications_open ? (
          <Button variant="outline" className="w-full" onClick={() => onApply(row)}>
            Reapply
          </Button>
        ) : row.application_status === 'APPROVED' ? (
          <p className="text-center text-xs font-medium text-emerald-700">You&apos;re part of this group</p>
        ) : row.application_status === 'PENDING' ? (
          <p className="text-center text-xs text-muted-foreground">Faculty will review your application</p>
        ) : (
          <p className="text-center text-xs text-muted-foreground">Check back when applications reopen</p>
        )}
      </div>
    </article>
  );
}

export default function StudentClubsChaptersPage() {
  const api = useAuthedApi();
  const eventsApi = useMemo(() => createCampusEventsApi(api), [api]);
  const [rows, setRows] = useState<CampusClubDirectoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [applyTarget, setApplyTarget] = useState<CampusClubDirectoryRow | null>(null);
  const [motivation, setMotivation] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const data = await eventsApi.listClubsDirectory();
    setRows(data);
  }, [eventsApi]);

  useEffect(() => {
    void load()
      .catch(() => toast.error('Could not load clubs and chapters'))
      .finally(() => setLoading(false));
  }, [load]);

  const filtered = useMemo(() => {
    if (filter === 'clubs') return rows.filter((r) => r.club_type !== 'CHAPTER');
    if (filter === 'chapters') return rows.filter((r) => r.club_type === 'CHAPTER');
    return rows;
  }, [rows, filter]);

  const openCount = rows.filter((r) => r.applications_open).length;

  async function submitApplication() {
    if (!applyTarget) return;
    setSubmitting(true);
    try {
      const res = await eventsApi.applyToClub(applyTarget.club_id, motivation.trim() || undefined);
      toast.success(`${res.message} — ${res.club_name}`);
      setApplyTarget(null);
      setMotivation('');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Application failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <StudentLoadingState label="Loading clubs & chapters…" />;
  }

  return (
    <StudentPageShell width="5xl">
      <StudentPageHeader
        title="Clubs & Chapters"
        description="Explore campus groups, learn what they do, and apply while membership drives are open."
        actions={
          <Badge variant="secondary" className="gap-1">
            <Users className="h-3.5 w-3.5" />
            {openCount} accepting applications
          </Badge>
        }
      />

      <div className="rounded-xl border border-sgvu-gold/30 bg-sgvu-gold/10 px-4 py-3 text-sm text-sgvu-navy">
        Registered for an event but not in the group yet?{' '}
        <Link href="/student/falcon-events" className="font-semibold underline">
          Browse Falcon Events
        </Link>{' '}
        for fests and workshops, or apply below to join a club or chapter long-term.
      </div>

      <StudentTabBar
        tabs={[
          { id: 'all' as const, label: 'All', count: rows.length },
          { id: 'clubs' as const, label: 'Clubs', count: rows.filter((r) => r.club_type !== 'CHAPTER').length },
          { id: 'chapters' as const, label: 'Chapters', count: rows.filter((r) => r.club_type === 'CHAPTER').length },
        ]}
        active={filter}
        onChange={setFilter}
      />

      {filtered.length === 0 ? (
        <StudentEmptyState
          icon={BookOpen}
          title="Nothing listed yet"
          description="Campus clubs and chapters will appear here once the registrar publishes the directory."
        />
      ) : (
        <div className={cn('grid gap-4 sm:grid-cols-2 xl:grid-cols-3')}>
          {filtered.map((row) => (
            <ClubCard key={row.club_id} row={row} onApply={setApplyTarget} />
          ))}
        </div>
      )}

      <Dialog open={Boolean(applyTarget)} onOpenChange={(open) => !open && setApplyTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Apply to {applyTarget?.name}</DialogTitle>
            <DialogDescription>
              Your request goes to the faculty advisor. You&apos;ll be notified once it&apos;s reviewed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium text-sgvu-navy">Why do you want to join? (optional)</label>
            <textarea
              className="min-h-[100px] w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm"
              placeholder="Skills you bring, past experience, or what you hope to learn…"
              value={motivation}
              onChange={(e) => setMotivation(e.target.value)}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setApplyTarget(null)}>
              Cancel
            </Button>
            <Button type="button" className="bg-sgvu-navy" disabled={submitting} onClick={() => void submitApplication()}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Submit application
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </StudentPageShell>
  );
}
