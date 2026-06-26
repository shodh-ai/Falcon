'use client';

import { useEffect, useState } from 'react';
import { LeadershipPageHeader, LeadershipSectionCard } from '@/components/leadership/LeadershipSectionCard';
import { EXECUTIVE_SPACING } from '@/components/leadership/executive/design-tokens';
import { useLeadershipApi } from '@/lib/api/api.leadership';

export default function LeadershipAuditLogPage() {
  const api = useLeadershipApi();
  const [logs, setLogs] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    void api.auditLog({ limit: 100 }).then((r) => setLogs(r as Record<string, unknown>[])).catch(() => setLogs([]));
  }, [api]);

  return (
    <div className={EXECUTIVE_SPACING.page}>
      <LeadershipPageHeader
        eyebrow="Risk & Audit"
        title="System Audit Trail — God Mode View"
        description="Master log of grade changes, fee ledger edits, and record deletions"
      />

      <LeadershipSectionCard title="Recent System Changes">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="pb-2 pr-4">Table</th>
                <th className="pb-2 pr-4">Action</th>
                <th className="pb-2 pr-4">User</th>
                <th className="pb-2">When</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l, i) => (
                <tr key={i} className="border-b border-sgvu-navy/5">
                  <td className="py-2 font-mono text-xs">{String((l as Record<string, unknown>).table_name ?? '—')}</td>
                  <td className="py-2">{String((l as Record<string, unknown>).action ?? '—')}</td>
                  <td className="py-2">{String((l as Record<string, unknown>).user_id ?? '—')}</td>
                  <td className="py-2 text-muted-foreground">
                    {new Date(String((l as Record<string, unknown>).created_at ?? '')).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {logs.length === 0 ? <p className="py-4 text-sm text-muted-foreground">No audit entries yet</p> : null}
        </div>
      </LeadershipSectionCard>
    </div>
  );
}
