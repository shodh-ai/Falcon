'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LeadershipPageHeader, LeadershipSectionCard } from '@/components/leadership/LeadershipSectionCard';
import { EXECUTIVE_SPACING } from '@/components/leadership/executive/design-tokens';
import { useLeadershipApi } from '@/lib/api/api.leadership';

export default function LeadershipBroadcastsPage() {
  const api = useLeadershipApi();
  const [broadcasts, setBroadcasts] = useState<Array<Record<string, unknown>>>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [role, setRole] = useState('Student');

  const reload = useCallback(() => {
    void api.executiveBroadcasts().then(setBroadcasts).catch(() => setBroadcasts([]));
  }, [api]);

  useEffect(() => {
    reload();
  }, [reload]);

  const send = async () => {
    try {
      await api.sendExecutiveBroadcast({
        subject,
        body,
        channels: ['EMAIL', 'PUSH'],
        audience_filter: { role },
      });
      toast.success('Broadcast queued');
      setSubject('');
      setBody('');
      reload();
    } catch {
      toast.error('Broadcast failed');
    }
  };

  return (
    <div className={EXECUTIVE_SPACING.page}>
      <LeadershipPageHeader
        eyebrow="Strategic Communication"
        title="Targeted Broadcasts"
        description="Email and push to filtered audiences (role-based; SMS/WhatsApp via integrations)"
      />

      <LeadershipSectionCard title="New Broadcast">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Target Role</label>
            <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Student, Faculty, Parent..." />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Subject</label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Message</label>
            <textarea
              rows={4}
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <Button onClick={() => void send()}>Send Broadcast</Button>
        </div>
      </LeadershipSectionCard>

      <LeadershipSectionCard title="Recent Broadcasts">
        <ul className="space-y-2 text-sm">
          {broadcasts.map((b) => (
            <li key={String(b.broadcast_id)} className="rounded-lg border px-3 py-2">
              <p className="font-semibold">{String(b.subject)}</p>
              <p className="text-xs text-muted-foreground">
                {String(b.recipient_count)} recipients · {new Date(String(b.sent_at)).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      </LeadershipSectionCard>
    </div>
  );
}
