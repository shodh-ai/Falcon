'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { getDashboardPathForRole } from '@/lib/auth-routing';

type AnnouncementDetail = {
  announcement_id: string;
  title: string;
  body_html: string;
  published_at?: string | null;
};

export default function AnnouncementDetailPage() {
  const params = useParams<{ id: string }>();
  const api = useAuthedApi();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [item, setItem] = useState<AnnouncementDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const homeHref = getDashboardPathForRole(
    user?.primaryRole ?? user?.role ?? 'CampusAdmin',
  );

  useEffect(() => {
    if (authLoading || !isAuthenticated) return;
    const id = params?.id;
    if (!id) {
      setError('Announcement not found');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void api
      .get<AnnouncementDetail>(`/api/admin-ops/announcements/${encodeURIComponent(id)}`)
      .then((row) => {
        if (cancelled) return;
        setItem(row);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setItem(null);
        setError(err instanceof Error ? err.message : 'Unable to load announcement');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, authLoading, isAuthenticated, params?.id]);

  if (authLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading…
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center">
        <p className="text-muted-foreground">Sign in to view this announcement.</p>
        <Button asChild className="mt-4">
          <Link href="/">Go to login</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <Button asChild variant="ghost" className="h-9 px-0 text-sgvu-navy">
        <Link href={homeHref}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
      </Button>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          {loading ? (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading announcement…
            </div>
          ) : error ? (
            <div className="space-y-3 py-6">
              <p className="text-sm text-destructive">{error}</p>
              <Button asChild variant="outline">
                <Link href="/notifications">Back to notifications</Link>
              </Button>
            </div>
          ) : item ? (
            <div className="space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sgvu-gold">
                Announcement
              </p>
              <h1 className="text-2xl font-bold text-sgvu-navy">{item.title}</h1>
              <p className="text-xs text-muted-foreground">
                {item.published_at
                  ? new Date(item.published_at).toLocaleString('en-IN')
                  : '—'}
              </p>
              <div
                className="prose prose-sm max-w-none pt-2 text-sm"
                dangerouslySetInnerHTML={{ __html: item.body_html }}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
