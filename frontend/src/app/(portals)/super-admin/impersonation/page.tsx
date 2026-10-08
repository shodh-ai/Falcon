'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
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

type ImpersonationTarget = {
  user_id: string;
  name: string;
  email: string;
  role_name: string;
  department_name: string | null;
};

export default function SuperAdminImpersonationPage() {
  const api = useAuthedApi();
  const { login } = useAuth();
  const [targetUserId, setTargetUserId] = useState('');
  const [targetQuery, setTargetQuery] = useState('');
  const [targets, setTargets] = useState<ImpersonationTarget[]>([]);
  const [loadingTargets, setLoadingTargets] = useState(false);
  const [reason, setReason] = useState('');
  const [logs, setLogs] = useState<LogRow[]>([]);

  const load = useCallback(
    () => void api.get<LogRow[]>('/api/super-admin/impersonation/logs').then(setLogs),
    [api],
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoadingTargets(true);
      api
        .get<ImpersonationTarget[]>(
          `/api/super-admin/impersonation/targets?q=${encodeURIComponent(targetQuery)}`,
        )
        .then((rows) => {
          setTargets(rows);
          setTargetUserId((current) =>
            current && rows.some((row) => row.user_id === current) ? current : '',
          );
        })
        .catch((error) => {
          toast.error(error instanceof Error ? error.message : 'Unable to load personas');
        })
        .finally(() => setLoadingTargets(false));
    }, 250);

    return () => window.clearTimeout(timer);
  }, [api, targetQuery]);

  async function impersonate() {
    if (!targetUserId) {
      toast.error('Select a persona to continue');
      return;
    }
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
          <CardTitle className="text-base">Choose a persona</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Input
            aria-label="Search personas"
            placeholder="Search by name, email, role, or department"
            value={targetQuery}
            onChange={(e) => setTargetQuery(e.target.value)}
          />
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center">
            <select
              aria-label="Persona"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={targetUserId}
              onChange={(event) => setTargetUserId(event.target.value)}
              disabled={loadingTargets}
            >
              <option value="">
                {loadingTargets ? 'Loading personas…' : 'Select a persona…'}
              </option>
              {targets.map((target) => (
                <option key={target.user_id} value={target.user_id}>
                  {target.name} — {target.role_name}
                  {target.department_name ? ` · ${target.department_name}` : ''}
                  {` · ${target.email}`}
                </option>
              ))}
            </select>
            <Input
              aria-label="Impersonation reason"
              placeholder="Reason for access (required)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <Button
              className="w-full shrink-0 whitespace-nowrap md:w-auto"
              disabled={!targetUserId || !reason.trim() || loadingTargets}
              onClick={() => void impersonate()}
            >
              View persona
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Persona sessions are read-only, expire after two hours, and are recorded in the audit log.
          </p>
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
