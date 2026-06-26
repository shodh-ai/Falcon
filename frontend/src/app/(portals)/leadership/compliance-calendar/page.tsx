'use client';

import { useEffect, useState } from 'react';
import { LeadershipPageHeader, LeadershipSectionCard } from '@/components/leadership/LeadershipSectionCard';
import { EXECUTIVE_SPACING } from '@/components/leadership/executive/design-tokens';
import { useLeadershipApi } from '@/lib/api/api.leadership';

export default function LeadershipComplianceCalendarPage() {
  const api = useLeadershipApi();
  const [events, setEvents] = useState<Array<Record<string, unknown>>>([]);
  const [matrix, setMatrix] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    void api.complianceCalendar().then(setEvents).catch(() => setEvents([]));
    void api.grievanceMatrix().then(setMatrix).catch(() => setMatrix(null));
  }, [api]);

  const alerts = (matrix?.alerts as Array<Record<string, unknown>>) ?? [];

  return (
    <div className={EXECUTIVE_SPACING.page}>
      <LeadershipPageHeader
        eyebrow="Risk & Compliance"
        title="Compliance Calendar & Escalation Matrix"
        description="Inspections, tax filings, accreditation renewals, and sensitive grievance alerts"
      />

      {alerts.length > 0 ? (
        <LeadershipSectionCard title="Immediate Grievance Alerts">
          <ul className="space-y-2 text-sm text-red-800">
            {alerts.map((a) => (
              <li key={String(a.category)} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                {String(a.category)}: {String(a.open_count)} open case(s)
              </li>
            ))}
          </ul>
        </LeadershipSectionCard>
      ) : null}

      <LeadershipSectionCard title="Compliance Calendar">
        <ul className="space-y-2 text-sm">
          {events.map((e) => (
            <li key={String(e.event_id)} className="flex justify-between rounded-lg border px-3 py-2">
              <span className="font-medium">{String(e.title)}</span>
              <span className="text-xs text-muted-foreground">
                {String(e.event_type)} · {String(e.due_date)} · {String(e.status)}
              </span>
            </li>
          ))}
          {events.length === 0 ? <li className="text-muted-foreground">No events scheduled — add via API seed</li> : null}
        </ul>
      </LeadershipSectionCard>
    </div>
  );
}
