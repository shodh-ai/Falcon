'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LeadershipPageHeader, LeadershipSectionCard } from '@/components/leadership/LeadershipSectionCard';
import { EXECUTIVE_SPACING } from '@/components/leadership/executive/design-tokens';
import { useLeadershipApi } from '@/lib/api/api.leadership';

export default function LeadershipMemosPage() {
  const api = useLeadershipApi();
  const [memos, setMemos] = useState<Array<Record<string, unknown>>>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [roles, setRoles] = useState('Dean,HOD');

  const reload = useCallback(() => {
    void api.executiveMemos().then(setMemos).catch(() => setMemos([]));
  }, [api]);

  useEffect(() => {
    reload();
  }, [reload]);

  const send = async () => {
    try {
      await api.sendExecutiveMemo({
        subject,
        body,
        audience_roles: roles.split(',').map((r) => r.trim()),
        confidential: true,
      });
      toast.success('Memo sent');
      setSubject('');
      setBody('');
      reload();
    } catch {
      toast.error('Failed to send memo');
    }
  };

  return (
    <div className={EXECUTIVE_SPACING.page}>
      <LeadershipPageHeader
        eyebrow="Strategic Communication"
        title="Confidential Memos"
        description="Secure directives to Deans, HODs, and Board — no-forward by default"
      />

      <LeadershipSectionCard title="Compose Memo">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Subject</label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Audience Roles (comma-separated)</label>
            <Input value={roles} onChange={(e) => setRoles(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Body</label>
            <textarea
              rows={5}
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <Button onClick={() => void send()}>Send Confidential Memo</Button>
        </div>
      </LeadershipSectionCard>

      <LeadershipSectionCard title="Sent Memos">
        <ul className="space-y-2 text-sm">
          {memos.map((m) => (
            <li key={String(m.memo_id)} className="rounded-lg border px-3 py-2">
              <p className="font-semibold">{String(m.subject)}</p>
              <p className="text-xs text-muted-foreground">
                {String(m.recipient_count)} recipients · {new Date(String(m.sent_at)).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      </LeadershipSectionCard>
    </div>
  );
}
