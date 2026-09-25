'use client';

import { Suspense } from 'react';
import { CalendarDays, ClipboardList } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { MyCalendarPanel } from '@/components/self-service/MyCalendarPanel';
import { MyLeavesPanel } from '@/components/self-service/MyLeavesPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

function WorkforceHubContent({ embedded }: { embedded?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedView = searchParams.get('view');
  const view = requestedView === 'calendar' ? 'calendar' : 'leave';

  function changeView(nextView: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('view', nextView);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const body = (
    <>
      {!embedded && (
        <section>
          <h2 className="text-2xl font-bold text-sgvu-navy">Attendance & Leave</h2>
          <p className="text-sm text-muted-foreground">
            Apply for leave or On Duty and review your personal attendance in one place.
          </p>
        </section>
      )}

      <Tabs value={view} onValueChange={changeView} className="space-y-4">
        <TabsList className="grid h-auto w-full max-w-xl grid-cols-2 p-1">
          <TabsTrigger value="leave" className="min-h-10 gap-2">
            <ClipboardList className="h-4 w-4" />
            Leave & On Duty
          </TabsTrigger>
          <TabsTrigger value="calendar" className="min-h-10 gap-2">
            <CalendarDays className="h-4 w-4" />
            Calendar & Attendance
          </TabsTrigger>
        </TabsList>
        <TabsContent value="leave">
          <MyLeavesPanel />
        </TabsContent>
        <TabsContent value="calendar">
          <MyCalendarPanel />
        </TabsContent>
      </Tabs>
    </>
  );

  if (embedded) {
    return <div className="space-y-6">{body}</div>;
  }

  return <div className="mx-auto w-full max-w-6xl space-y-6">{body}</div>;
}

export function WorkforceHubPage({ embedded }: { embedded?: boolean } = {}) {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <WorkforceHubContent embedded={embedded} />
    </Suspense>
  );
}
