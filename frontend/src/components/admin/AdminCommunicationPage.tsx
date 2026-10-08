'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { REG_BRAND_BTN } from '@/components/admin/registrar-desk/RegistrarDeskChrome';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useAuthedApi } from '@/lib/api';
import { toast } from '@/lib/notifications/falcon-toast';
import { cn } from '@/lib/utils';

type AnnouncementRow = {
  announcement_id: string;
  title: string;
  body_html: string;
  published_at?: string | null;
  created_by_name?: string | null;
  target_all_students?: boolean;
  target_all_faculty?: boolean;
};

type FormState = {
  title: string;
  body: string;
  category: 'CIRCULAR' | 'HOLIDAY' | 'EXAM' | 'PLACEMENT' | 'MAINTENANCE' | 'EMERGENCY';
  audience: 'everyone' | 'students' | 'faculty';
};

const EMPTY_FORM: FormState = {
  title: '',
  body: '',
  category: 'CIRCULAR',
  audience: 'everyone',
};

function audienceLabel(row: AnnouncementRow) {
  if (row.target_all_students && row.target_all_faculty) return 'Everyone';
  if (row.target_all_students) return 'Students';
  if (row.target_all_faculty) return 'Faculty & Staff';
  return 'Scoped';
}

export function AdminCommunicationPage() {
  const api = useAuthedApi();
  const [items, setItems] = useState<AnnouncementRow[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const rows = await api.get<AnnouncementRow[]>('/api/admin-control/announcements');
      setItems(rows ?? []);
    } catch (err) {
      setItems([]);
      setError(err instanceof Error ? err.message : 'Failed to load announcements');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    let cancelled = false;
    void api
      .get<AnnouncementRow[]>('/api/admin-control/announcements')
      .then((rows) => {
        if (cancelled) return;
        setItems(rows ?? []);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setItems([]);
        setError(err instanceof Error ? err.message : 'Failed to load announcements');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  async function publish(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/api/admin-control/announcements', form);
      toast.success('Announcement published to the live notice board');
      setForm(EMPTY_FORM);
      setLoading(true);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not publish announcement');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="space-y-5 p-5 md:p-6">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-sgvu-gold">
              Admin Control Center
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-sgvu-navy sm:text-3xl">
              Communication
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              Publish announcements through Falcon’s live notice-board pipeline. Messages created
              here use the same canonical announcement service and feed consumed by end users.
            </p>
          </div>

          <div className="rounded-xl border border-sgvu-gold/25 bg-sgvu-gold/5 px-4 py-3 text-sm text-sgvu-navy">
            Notice Board audiences currently supported by the shared announcement service:
            <span className="ml-1 font-medium">Everyone, Students, Faculty & Staff.</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        <Card className="border-sgvu-navy/10 bg-white shadow-sm">
          <CardContent className="space-y-4 p-5">
            <div>
              <h2 className="text-lg font-semibold text-sgvu-navy">Create Announcement</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Publish a message to the shared user feed without creating a second announcement
                system.
              </p>
            </div>

            <form onSubmit={publish} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-sgvu-navy">Title</label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="Headline"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-sgvu-navy">Category</label>
                <Select
                  value={form.category}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      category: e.target.value as FormState['category'],
                    }))
                  }
                  className="h-11 rounded-xl border-sgvu-navy/15"
                >
                  <option value="CIRCULAR">Circular</option>
                  <option value="HOLIDAY">Holiday</option>
                  <option value="EXAM">Exam</option>
                  <option value="PLACEMENT">Placement</option>
                  <option value="MAINTENANCE">Maintenance</option>
                  <option value="EMERGENCY">Emergency</option>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-sgvu-navy">Audience</label>
                <Select
                  value={form.audience}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      audience: e.target.value as FormState['audience'],
                    }))
                  }
                  className="h-11 rounded-xl border-sgvu-navy/15"
                >
                  <option value="everyone">Everyone</option>
                  <option value="students">Students</option>
                  <option value="faculty">Faculty & Staff</option>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-sgvu-navy">Content</label>
                <textarea
                  className="min-h-[180px] w-full rounded-xl border border-sgvu-navy/15 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgvu-gold"
                  value={form.body}
                  onChange={(e) => setForm((prev) => ({ ...prev, body: e.target.value }))}
                  placeholder="Campus circular, notice, or emergency update"
                  required
                />
              </div>
              <Button
                type="submit"
                className={cn('w-full', REG_BRAND_BTN)}
                disabled={submitting || !form.title.trim() || !form.body.trim()}
              >
                {submitting ? 'Publishing…' : 'Publish announcement'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-sgvu-navy/10 bg-white shadow-sm">
          <CardContent className="space-y-4 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-sgvu-navy">Published Announcements</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Live notice-board records returned by the shared announcement API.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setLoading(true);
                  void load();
                }}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading announcements…
              </div>
            ) : error ? (
              <div className="space-y-4 py-16 text-center">
                <p className="text-sm text-red-600">{error}</p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setLoading(true);
                    void load();
                  }}
                >
                  Retry
                </Button>
              </div>
            ) : items.length === 0 ? (
              <div className="space-y-3 py-16 text-center">
                <p className="font-semibold text-sgvu-navy">No announcements published yet</p>
                <p className="text-sm text-muted-foreground">
                  Publish the first Admin Control Center announcement to seed the notice board.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {items.map((item) => (
                  <div
                    key={item.announcement_id}
                    className="rounded-xl border border-sgvu-navy/10 bg-slate-50/60 p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-sgvu-navy">{item.title}</p>
                      <Badge variant="outline" className="border-sgvu-navy/15 bg-white text-sgvu-navy">
                        {audienceLabel(item)}
                      </Badge>
                    </div>
                    <div
                      className="prose prose-sm mt-2 max-w-none text-muted-foreground"
                      dangerouslySetInnerHTML={{ __html: item.body_html }}
                    />
                    <p className="mt-3 text-xs text-muted-foreground">
                      {item.published_at
                        ? new Date(item.published_at).toLocaleString('en-IN')
                        : 'Draft / unpublished'}
                      {item.created_by_name ? ` · ${item.created_by_name}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
