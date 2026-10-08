'use client';

import { useEffect, useState } from 'react';
import { useAuthedApi } from '@/lib/api';

type Announcement = {
  announcement_id: string;
  title: string;
  body: string;
  created_at: string;
  faculty_name?: string;
};

type Props = { courseId: string };

export function StudentAnnouncementsTab({ courseId }: Props) {
  const api = useAuthedApi();
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void api
      .get<Announcement[]>(`/api/academics/student/courses/${courseId}/announcements`)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [api, courseId]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading announcements…</p>;
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No course announcements yet.</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.announcement_id} className="rounded-xl border border-border/60 bg-background p-4">
          <p className="font-semibold text-sgvu-navy">{item.title}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{item.body}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {new Date(item.created_at).toLocaleString('en-IN')}
            {item.faculty_name ? ` · ${item.faculty_name}` : ''}
          </p>
        </div>
      ))}
    </div>
  );
}
