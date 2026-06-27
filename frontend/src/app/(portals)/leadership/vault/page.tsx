'use client';

import { useCallback, useEffect, useState } from 'react';
import { ExecutiveFeatureGrid, EXECUTIVE_SPACING } from '@/components/leadership/executive';
import { LeadershipPageHeader, LeadershipSectionCard } from '@/components/leadership/LeadershipSectionCard';
import { useLeadershipApi } from '@/lib/api/api.leadership';
import { getLeadershipHubRoutes } from '@/lib/leadership-hub-routes';

export default function LeadershipVaultPage() {
  const api = useLeadershipApi();
  const [documents, setDocuments] = useState<Array<Record<string, unknown>>>([]);
  const [mous, setMous] = useState<Array<Record<string, unknown>>>([]);
  const [logs, setLogs] = useState<Array<Record<string, unknown>>>([]);

  const reload = useCallback(() => {
    void api.executiveDocuments().then(setDocuments).catch(() => setDocuments([]));
    void api.executiveMous().then(setMous).catch(() => setMous([]));
    void api.documentAccessLogs().then(setLogs).catch(() => setLogs([]));
  }, [api]);

  useEffect(() => {
    reload();
  }, [reload]);

  const vaultHub = getLeadershipHubRoutes('vault');

  return (
    <div className={EXECUTIVE_SPACING.page}>
      <LeadershipPageHeader
        eyebrow="Secure Document Vault"
        title="Legal Hub & MoU Tracker"
        description="Confidential repository with access logs and partnership renewal alerts"
      />

      <ExecutiveFeatureGrid title={vaultHub.title} description={vaultHub.description} routes={vaultHub.routes} />

      <LeadershipSectionCard title="Confidential Documents">
        <ul className="space-y-2 text-sm">
          {documents.map((d) => (
            <li key={String(d.document_id)} className="flex justify-between rounded-lg border px-3 py-2">
              <span className="font-medium">{String(d.title)}</span>
              <span className="text-xs text-muted-foreground">{String(d.category)} · v{String(d.version)}</span>
            </li>
          ))}
          {documents.length === 0 ? <li className="text-muted-foreground">No documents registered yet</li> : null}
        </ul>
      </LeadershipSectionCard>

      <LeadershipSectionCard title="MoU & Partnership Tracker">
        <ul className="space-y-2 text-sm">
          {mous.map((m) => (
            <li
              key={String(m.mou_id)}
              className={`rounded-lg border px-3 py-2 ${m.renewal_alert ? 'border-amber-300 bg-amber-50' : ''}`}
            >
              <p className="font-semibold">{String(m.partner_name)}</p>
              <p className="text-xs text-muted-foreground">
                Expires {String(m.expires_on)} · {String(m.mou_type)}
                {m.renewal_alert ? ' · RENEWAL ALERT' : ''}
              </p>
            </li>
          ))}
          {mous.length === 0 ? <li className="text-muted-foreground">No MoUs tracked</li> : null}
        </ul>
      </LeadershipSectionCard>

      <LeadershipSectionCard title="Access Audit Log">
        <ul className="max-h-64 space-y-1 overflow-y-auto text-xs">
          {logs.map((l) => (
            <li key={String(l.log_id)} className="flex justify-between border-b py-1">
              <span>{String(l.user_name ?? l.user_id)} · {String(l.action)} · {String(l.title ?? '')}</span>
              <span className="text-muted-foreground">{new Date(String(l.created_at)).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </LeadershipSectionCard>
    </div>
  );
}
