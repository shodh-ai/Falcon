'use client';

import { FormEvent, useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { FacultyEmptyState, FacultyPanel } from '@/components/faculty';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';
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
  const api = useAuthedApi();
  const [items, setItems] = useState<Announcement[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function load() {
    void api
      .get<Announcement[]>(`/api/academics/faculty/courses/${courseId}/announcements`)
      .then((rows) =>
        setItems(
          withFacultyDemoFallback(
            rows,
            facultyDemoAnnouncements(courseId) as Announcement[],
            isEmptyArray,
          ),
        ),
      )
      .catch(() =>
        setItems(
          withFacultyDemoFallback(
            [],
            facultyDemoAnnouncements(courseId) as Announcement[],
            isEmptyArray,
          ),
        ),
      );
  }

  useEffect(() => {
    load();
  }, [api, courseId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
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
    setSubmitting(true);
    try {
      const created = await api.post<{ notified_count?: number }>(
        `/api/academics/faculty/courses/${courseId}/announcements`,
        { title: title.trim(), body: body.trim() },
      );
      const n = Number(created?.notified_count ?? 0);
      toast.success(`Announcement posted. Notifications sent to ${n} student${n === 1 ? '' : 's'}.`);
      setTitle('');
      setBody('');
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to post announcement');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <FacultyPanel title="Post announcement" description="Notify enrolled students in this course">
        <form className="space-y-3" onSubmit={onSubmit}>
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
        </form>
      </FacultyPanel>

      <FacultyPanel title="Recent announcements" count={items.length}>
        {items.length === 0 ? (
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
