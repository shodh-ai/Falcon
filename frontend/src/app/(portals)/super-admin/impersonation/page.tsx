'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

type LogRow = {
  session_id: string;
  impersonator_name: string;
  target_name: string;
  started_at: string;
  ended_at: string | null;
  reason: string | null;
};

export default function SuperAdminImpersonationPage() {
  const api = useAuthedApi();
  const { login } = useAuth();
  const [targetUserId, setTargetUserId] = useState('');
  const [reason, setReason] = useState('');
  const [logs, setLogs] = useState<LogRow[]>([]);

  const load = () => void api.get<LogRow[]>('/api/super-admin/impersonation/logs').then(setLogs);

  useEffect(() => {
    load();
  }, [api]);

  async function impersonate() {
    try {
      const res = await api.post<{ token: string; target: { name: string; role: string } }>(
        '/api/super-admin/impersonate',
        { target_user_id: targetUserId, reason },
      );
      login(res.token, {
        user_id: targetUserId,
        email: '',
        name: res.target.name,
        role: res.target.role,
      });
      toast.success(`Now viewing as ${res.target.name} (${res.target.role}) — read-only mode`);
      window.location.href = '/';
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Impersonation failed');
    }
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Impersonation Mode</h1>
      <p className="text-sm text-muted-foreground">
        Log in as another user to debug grievances. Write and payment actions are blocked; all sessions are audited.
      </p>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Start impersonation</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 md:flex-row">
          <Input placeholder="Target user UUID" value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)} />
          <Input placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button onClick={() => void impersonate()}>Log in as user</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audit log</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {logs.map((l) => (
            <div key={l.session_id} className="rounded border p-2">
              {l.impersonator_name} → {l.target_name} · {new Date(l.started_at).toLocaleString()}
              {l.reason && ` · ${l.reason}`}
            </div>
          ))}
          {!logs.length && <p className="text-muted-foreground">No impersonation sessions yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
