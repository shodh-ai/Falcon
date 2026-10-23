'use client';

import { FormEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { FacultyEmptyState, FacultyErrorBanner, FacultyInlineLoading, FacultyPanel } from '@/components/faculty';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import {
  isEmptyArray,
  isFacultyDemoEntityId,
  withFacultyDemoFallback,
} from '@/lib/faculty-demo-mode';
import { facultyDemoAnnouncements } from '@/lib/mock/faculty-portal-demo';

type Announcement = {
  announcement_id: string;
  title: string;
  body: string;
  created_at: string;
  faculty_name?: string;
};

type Props = { courseId: string };

export function FacultyAnnouncementsTab({ courseId }: Props) {
  const { user, token } = useAuth();
  return <AnnouncementsWorkspace key={`${courseId}:${user?.user_id ?? ''}:${token ?? ''}`} courseId={courseId} />;
}

function AnnouncementsWorkspace({ courseId }: Props) {
  const api = useAuthedApi();
  const [items, setItems] = useState<Announcement[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const alive = useRef(false);
  const activeApi = useRef(api);
  useLayoutEffect(() => { activeApi.current = api; }, [api]);
  const saveLock = useRef(false);
  const current = useCallback(() => alive.current && activeApi.current === api, [api]);

  const load = useCallback(() => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(null);
    void api
      .get<Announcement[]>(`/api/academics/faculty/courses/${courseId}/announcements`)
      .then((rows) => {
        if (!current() || currentRequest !== requestId.current) return;
        setItems(
          withFacultyDemoFallback(
            rows,
            facultyDemoAnnouncements(courseId) as Announcement[],
            isEmptyArray,
          ),
        );
      })
      .catch((err: unknown) => {
        if (!current() || currentRequest !== requestId.current) return;
        const fallback = withFacultyDemoFallback(
            [],
            facultyDemoAnnouncements(courseId) as Announcement[],
            isEmptyArray,
          );
        if (fallback.length) setItems(fallback);
        if (fallback.length === 0) setError(err instanceof Error ? err.message : 'Failed to load announcements');
      })
      .finally(() => { if (current() && currentRequest === requestId.current) setLoading(false); });
  }, [api, courseId, current]);

  useEffect(() => {
    alive.current = true;
    saveLock.current = false;
    // Clear the previous account/course draft before fetching this workspace.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSubmitting(false); setTitle(''); setBody('');
    // Clear the previous course's notices while this course is fetched.
    setItems([]);
    load();
    return () => { alive.current = false; requestId.current += 1; };
  }, [load]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (saveLock.current || !current() || !title.trim() || !body.trim()) return;
    if (isFacultyDemoEntityId(courseId)) {
      const local: Announcement = {
        announcement_id: `ann-${Date.now()}-${courseId}`,
        title: title.trim(),
        body: body.trim(),
        created_at: new Date().toISOString(),
      };
      setItems((prev) => [local, ...prev]);
      toast.success('Announcement posted (demo)');
      setTitle('');
      setBody('');
      return;
    }
    saveLock.current = true;
    setSubmitting(true);
    try {
      const created = await api.post<{ notified_count?: number }>(
        `/api/academics/faculty/courses/${courseId}/announcements`,
        { title: title.trim(), body: body.trim() },
      );
      if (!current()) return;
      const n = Number(created?.notified_count ?? 0);
      toast.success(`Announcement posted. Notifications sent to ${n} student${n === 1 ? '' : 's'}.`);
      setTitle('');
      setBody('');
      load();
    } catch (err) {
      if (current()) toast.error(err instanceof Error ? err.message : 'Failed to post announcement');
    } finally {
      if (current()) { saveLock.current = false; setSubmitting(false); }
    }
  }

  return (
    <div className="space-y-4">
      <FacultyPanel title="Post announcement" description="Notify enrolled students in this course">
        <form className="space-y-3" onSubmit={onSubmit}>
          <fieldset disabled={submitting} className="space-y-3">
          <Input
            required
            placeholder="Announcement title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            required
            className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="Message for students"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Posting…' : 'Publish announcement'}
          </Button>
          </fieldset>
        </form>
      </FacultyPanel>

      <FacultyPanel title="Recent announcements" count={items.length}>
        {loading ? <FacultyInlineLoading label="Loading announcements…" /> : error ? (
          <><FacultyErrorBanner message={error} /><Button type="button" variant="outline" disabled={submitting} onClick={load}>Retry announcements</Button></>
        ) : items.length === 0 ? (
          <FacultyEmptyState
            title="No announcements yet"
            description="Post course notices so students see them in the LMS and notification bell."
          />
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.announcement_id}
                className="rounded-xl border border-border/60 bg-background p-4"
              >
                <p className="font-semibold text-sgvu-navy">{item.title}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{item.body}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {new Date(item.created_at).toLocaleString('en-IN')}
                  {item.faculty_name ? ` · ${item.faculty_name}` : ''}
                </p>
              </div>
            ))}
          </div>
        )}
      </FacultyPanel>
    </div>
  );
}
