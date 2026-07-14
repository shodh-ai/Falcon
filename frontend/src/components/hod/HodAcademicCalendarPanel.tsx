'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { HodPanel } from '@/components/hod/HodPagePrimitives';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import { cn } from '@/lib/utils';

type CalendarItem = {
  activity_id: string;
  activity_date: string;
  activity_name: string;
  description?: string | null;
  academic_year?: string | null;
};

export function HodAcademicCalendarPanel() {
  const api = useAuthedApi();
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ items: CalendarItem[] }>(
        '/api/academics/hod/academic-calendar',
      );
      setItems(res.items ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load academic calendar');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const formatDate = (dateStr: string) =>
    new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  if (loading) {
    return (
      <HodPanel title="Department Academic Calendar">
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Loading calendar…
        </div>
      </HodPanel>
    );
  }

  return (
    <HodPanel title="Department Academic Calendar">
      <p className="text-xs text-muted-foreground mb-3 px-1">
        Upcoming activities from the university academic calendar for your department
      </p>
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No upcoming department activities on the calendar.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const isTomorrow =
              item.activity_date ===
              new Date(Date.now() + 86400000).toISOString().slice(0, 10);
            const isToday = item.activity_date === today;
            return (
              <li
                key={item.activity_id}
                className="rounded-lg border border-slate-100 bg-white px-4 py-3 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm text-sgvu-navy">
                      {item.activity_name}
                    </p>
                    {item.description ? (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {item.description}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-semibold text-slate-700">
                      {formatDate(item.activity_date)}
                    </p>
                    {isToday ? (
                      <Badge className="mt-1 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                        Today
                      </Badge>
                    ) : isTomorrow ? (
                      <Badge className="mt-1 bg-amber-100 text-amber-800 hover:bg-amber-100">
                        Tomorrow
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className={cn(
                          'mt-1 text-[10px]',
                          item.activity_date < today && 'opacity-60',
                        )}
                      >
                        Scheduled
                      </Badge>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </HodPanel>
  );
}
