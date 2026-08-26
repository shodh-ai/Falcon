'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Bell, Loader2, Megaphone, Pencil, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useAuthedApi } from '@/lib/api';
import { toast } from '@/lib/notifications/falcon-toast';

type AnnouncementAudience = 'all' | 'students' | 'faculty' | 'hods' | 'staff';

type AnnouncementRow = {
  announcement_id: string;
  title: string;
  body_html: string;
  published_at?: string | null;
  created_by_name?: string | null;
  is_published?: boolean | null;
  target_all_students?: boolean;
  target_all_faculty?: boolean;
  target_dept_ids?: number[] | null;
};

const AUDIENCE_OPTIONS: Array<{ value: AnnouncementAudience; label: string }> = [
  { value: 'all', label: 'All (Students, Faculty, HODs, Staff)' },
  { value: 'students', label: 'Students' },
  { value: 'faculty', label: 'Faculty' },
  { value: 'hods', label: 'HODs' },
  { value: 'staff', label: 'Staff' },
];

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function htmlToPlain(html: string) {
  return html
    .replace(/<\/p>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseApiError(err: unknown) {
  if (!(err instanceof Error)) return 'Something went wrong';
  try {
    const parsed = JSON.parse(err.message) as { message?: string | string[] };
    if (Array.isArray(parsed.message)) return parsed.message.join(', ');
    if (parsed.message) return parsed.message;
  } catch {
    /* plain text */
  }
  return err.message;
}

export function CampusAdminAnnouncementsPage() {
  const api = useAuthedApi();
  const [items, setItems] = useState<AnnouncementRow[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<AnnouncementAudience>('all');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const rows = await api.get<AnnouncementRow[]>('/api/admin-ops/announcements');
      setItems(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setItems([]);
      setError(parseApiError(err) || 'Unable to load announcements');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  async function publish(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await api.post<{ notified?: number }>('/api/admin-ops/announcements', {
        title: title.trim(),
        body_html: `<p>${body.trim().replace(/\n/g, '</p><p>')}</p>`,
        audience,
        notify: true,
      });
      const notified = typeof result?.notified === 'number' ? result.notified : 0;
      toast.success(
        notified > 0
          ? `Announcement published. ${notified} notification${notified === 1 ? '' : 's'} sent.`
          : 'Announcement published.',
      );
      setTitle('');
      setBody('');
      setAudience('all');
      setLoading(true);
      await load();
    } catch (err) {
      toast.error(parseApiError(err) || 'Could not publish announcement');
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(item: AnnouncementRow) {
    setEditingId(item.announcement_id);
    setEditTitle(item.title);
    setEditBody(htmlToPlain(item.body_html));
  }

  async function saveEdit(announcementId: string) {
    setSavingId(announcementId);
    try {
      await api.patch(`/api/admin-ops/announcements/${announcementId}`, {
        title: editTitle.trim(),
        body_html: `<p>${editBody.trim().replace(/\n/g, '</p><p>')}</p>`,
        is_published: true,
      });
      toast.success('Announcement updated.');
      setEditingId(null);
      setLoading(true);
      await load();
    } catch (err) {
      toast.error(parseApiError(err) || 'Could not update announcement');
    } finally {
      setSavingId(null);
    }
  }

  async function unpublish(announcementId: string) {
    if (!window.confirm('Unpublish this announcement? It will no longer appear on notice boards.')) {
      return;
    }
    setSavingId(announcementId);
    try {
      await api.del(`/api/admin-ops/announcements/${announcementId}`);
      toast.success('Announcement unpublished.');
      setLoading(true);
      await load();
    } catch (err) {
      toast.error(parseApiError(err) || 'Could not unpublish announcement');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sgvu-gold">
            Communication
          </p>
          <h1 className="mt-1 text-2xl font-bold text-sgvu-navy">Announcements</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Publish campus notices and notify the selected audience.
          </p>
        </CardContent>
      </Card>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-bold text-sgvu-navy">
            <Megaphone className="h-4 w-4 text-sgvu-gold" />
            Publish announcement
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={publish} className="space-y-3">
            <Input
              placeholder="Headline"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
            <textarea
              className="min-h-[120px] w-full rounded-lg border border-border/60 px-3 py-2 text-sm"
              placeholder="Announcement details…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
            />
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Audience
                </label>
                <Select
                  value={audience}
                  onChange={(e) => setAudience(e.target.value as AnnouncementAudience)}
                >
                  {AUDIENCE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>
              <Button type="submit" disabled={submitting} className="h-10">
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Publishing…
                  </>
                ) : (
                  <>
                    <Bell className="h-4 w-4" />
                    Publish &amp; notify
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-bold text-sgvu-navy">Recent announcements</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : error ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
              <p>{error}</p>
              <Button className="mt-3 h-8" variant="outline" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          ) : !items.length ? (
            <p className="py-8 text-sm text-muted-foreground">No announcements published yet.</p>
          ) : (
            <ul className="space-y-3">
              {items.map((item) => {
                const published = item.is_published !== false;
                const editing = editingId === item.announcement_id;
                return (
                  <li
                    key={item.announcement_id}
                    className="rounded-xl border border-sgvu-navy/10 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        {editing ? (
                          <div className="space-y-2">
                            <Input
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                            />
                            <textarea
                              className="min-h-[100px] w-full rounded-lg border border-border/60 px-3 py-2 text-sm"
                              value={editBody}
                              onChange={(e) => setEditBody(e.target.value)}
                            />
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                className="h-8"
                                disabled={savingId === item.announcement_id}
                                onClick={() => void saveEdit(item.announcement_id)}
                              >
                                {savingId === item.announcement_id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : null}
                                Save
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                className="h-8"
                                onClick={() => setEditingId(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="font-semibold text-sgvu-navy">{item.title}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {formatDate(item.published_at)}
                              {item.created_by_name ? ` · ${item.created_by_name}` : ''}
                            </p>
                          </>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={published ? 'outline' : 'secondary'}
                          className="border-sgvu-navy/20 text-sgvu-navy"
                        >
                          {published ? 'Published' : 'Unpublished'}
                        </Badge>
                        {!editing ? (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              className="h-8"
                              onClick={() => startEdit(item)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Edit
                            </Button>
                            {published ? (
                              <Button
                                type="button"
                                variant="outline"
                                className="h-8 text-destructive"
                                disabled={savingId === item.announcement_id}
                                onClick={() => void unpublish(item.announcement_id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Unpublish
                              </Button>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    </div>
                    {!editing ? (
                      <div
                        className="prose prose-sm mt-3 max-w-none text-sm"
                        dangerouslySetInnerHTML={{ __html: item.body_html }}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
