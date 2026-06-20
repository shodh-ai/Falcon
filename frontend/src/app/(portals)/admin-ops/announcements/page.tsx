'use client';

import { FormEvent, useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';

type Announcement = {
  announcement_id: string;
  title: string;
  body_html: string;
  published_at: string;
};

export default function AdminAnnouncementsPage() {
  const api = useAuthedApi();
  const [items, setItems] = useState<Announcement[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  async function load() {
    const data = await api.get<Announcement[]>('/api/admin-ops/announcements');
    setItems(data);
  }

  useEffect(() => {
    void load();
  }, [api]);

  async function publish(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post('/api/admin-ops/announcements', {
        title,
        body_html: `<p>${body.replace(/\n/g, '</p><p>')}</p>`,
      });
      toast.success('Published to everyone’s Notice Board');
      setTitle('');
      setBody('');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Publish failed');
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-sgvu-navy">Campus News & Announcements</h1>
        <p className="text-sm text-muted-foreground">
          Generic campus notices — every student and staff member sees the same Notice Board on web and mobile.
        </p>
      </div>

      <form onSubmit={publish} className="space-y-3 rounded-xl border p-4">
        <Input placeholder="Headline" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <textarea
          className="w-full min-h-[120px] rounded-lg border border-border/60 px-3 py-2 text-sm"
          placeholder="Campus news, holidays, exam dates, general info…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
        />
        <Button type="submit">Publish to Notice Board</Button>
      </form>

      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.announcement_id} className="rounded-xl border p-4">
            <p className="font-bold text-sgvu-navy">{item.title}</p>
            <p className="text-xs text-muted-foreground mt-1">{new Date(item.published_at).toLocaleString()}</p>
            <div className="mt-2 text-sm prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: item.body_html }} />
          </li>
        ))}
      </ul>
    </div>
  );
}
