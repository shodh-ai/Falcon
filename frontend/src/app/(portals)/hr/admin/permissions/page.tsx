'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Search } from 'lucide-react';
import { HrPageHeader } from '@/components/hr/HrPageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useHrApi } from '@/lib/api/use-hr-api';
import { useHrEntity } from '@/context/HrEntityContext';

const MODULES = [
  'onboarding',
  'offboarding',
  'payroll',
  'biometrics',
  'leaves',
  'documents',
  'policies',
  'rules',
  'directory',
  'attendance',
  'recruitment',
  'dashboard',
  'reports',
] as const;
const LEVELS = ['none', 'read', 'write'] as const;

type PermRow = {
  user_id: string;
  name: string;
  email: string;
  role: string;
  department: string | null;
  capabilities: Record<string, string>;
};

export default function HrPermissionsPage() {
  const api = useHrApi();
  const { entityId } = useHrEntity();
  const [rows, setRows] = useState<PermRow[]>([]);
  const [query, setQuery] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const saveTimers = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(query), 300);
    return () => window.clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const path = debouncedQ
      ? `/api/hr/admin/permissions?q=${encodeURIComponent(debouncedQ)}&limit=100`
      : '/api/hr/admin/permissions?limit=100';
    void api.get<PermRow[]>(path).then(setRows);
  }, [api, entityId, debouncedQ]);

  useEffect(() => {
    const timers = saveTimers.current;
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      timers.clear();
    };
  }, []);

  function setCap(userId: string, module: string, level: string) {
    setRows((prev) =>
      prev.map((r) =>
        r.user_id === userId
          ? { ...r, capabilities: { ...r.capabilities, [module]: level } }
          : r,
      ),
    );

    const cellKey = `${userId}:${module}`;
    const existing = saveTimers.current.get(cellKey);
    if (existing) window.clearTimeout(existing);

    saveTimers.current.set(
      cellKey,
      window.setTimeout(() => {
        void patchPermission(userId, module, level, cellKey);
      }, 400),
    );
  }

  async function patchPermission(userId: string, module: string, level: string, cellKey: string) {
    setSavingCell(cellKey);
    try {
      await api.patch(`/api/hr/admin/permissions/${userId}`, { module, level });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavingCell((prev) => (prev === cellKey ? null : prev));
      saveTimers.current.delete(cellKey);
    }
  }

  function hasPermissions(row: PermRow) {
    return Object.values(row.capabilities).some((v) => v && v !== 'none');
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <HrPageHeader
        title="HR Access Matrix"
        description="Grant Read, Write, or None per module — changes save automatically when you change a dropdown."
      />

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search staff (e.g. faculty, professor)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[1200px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th className="p-3">Staff</th>
                <th className="p-3">Role</th>
                <th className="p-3">Department</th>
                {MODULES.map((m) => (
                  <th key={m} className="p-3 capitalize">
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.user_id}
                  className={`border-b ${hasPermissions(row) ? 'bg-amber-50/40' : ''}`}
                >
                  <td className="p-3">
                    {row.name}
                    <span className="block text-xs text-muted-foreground">{row.email}</span>
                    {hasPermissions(row) && (
                      <Badge variant="outline" className="mt-1 text-[10px]">
                        Has access
                      </Badge>
                    )}
                  </td>
                  <td className="p-3 text-xs">{row.role}</td>
                  <td className="p-3 text-xs">{row.department ?? '—'}</td>
                  {MODULES.map((mod) => {
                    const cellKey = `${row.user_id}:${mod}`;
                    const isSaving = savingCell === cellKey;
                    return (
                      <td key={mod} className="p-2">
                        <select
                          className={`w-full rounded border px-1 py-1 text-xs ${isSaving ? 'border-amber-400 bg-amber-50' : ''}`}
                          value={row.capabilities[mod] ?? 'none'}
                          onChange={(e) => setCap(row.user_id, mod, e.target.value)}
                        >
                          {LEVELS.map((l) => (
                            <option key={l} value={l}>
                              {l}
                            </option>
                          ))}
                        </select>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={MODULES.length + 3} className="p-6 text-muted-foreground">
                    No staff found. Try a different search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
