'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { HodPanel } from '@/components/hod/HodPagePrimitives';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';

type FacultyOption = { user_id: string; name: string; email: string };

type StaffRole = {
  role_type: string;
  label: string;
  faculty_user_id: string | null;
  faculty_name: string | null;
};

type StaffRolesPayload = {
  dept_id: number | null;
  roles: StaffRole[];
  faculty_options: FacultyOption[];
};

export function HodStaffRolesPanel() {
  const api = useAuthedApi();
  const [data, setData] = useState<StaffRolesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<StaffRolesPayload>('/api/academics/hod/staff-roles');
      setData(res);
      const initial: Record<string, string> = {};
      for (const role of res.roles ?? []) {
        initial[role.role_type] = role.faculty_user_id ?? '';
      }
      setPending(initial);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load staff roles');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveRole = async (roleType: string) => {
    const facultyUserId = pending[roleType];
    if (!facultyUserId) {
      toast.error('Select a faculty member first');
      return;
    }
    setSaving(roleType);
    try {
      const res = await api.post<StaffRolesPayload>('/api/academics/hod/staff-roles', {
        role_type: roleType,
        faculty_user_id: facultyUserId,
      });
      setData(res);
      toast.success('Staff role updated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update role');
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <HodPanel title="Department Staff Duties">
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Loading staff assignments…
        </div>
      </HodPanel>
    );
  }

  if (!data?.roles?.length) {
    return (
      <HodPanel title="Department Staff Duties">
        <p className="py-6 text-center text-sm text-muted-foreground">
          No staff role assignments configured yet.
        </p>
      </HodPanel>
    );
  }

  return (
    <HodPanel title="Department Staff Duties">
      <p className="text-xs text-muted-foreground mb-3 px-1">
        Coordinators and in-charges for your department
      </p>
      <div className="space-y-3">
        {data.roles.map((role) => (
          <div
            key={role.role_type}
            className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-slate-50/60 p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-sgvu-navy">{role.label}</p>
              <p className="text-xs text-muted-foreground truncate">
                {role.faculty_name ? `Current: ${role.faculty_name}` : 'Not assigned'}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Select
                value={pending[role.role_type] || ''}
                onValueChange={(v) =>
                  setPending((prev) => ({ ...prev, [role.role_type]: v }))
                }
              >
                <SelectTrigger className="h-9 w-[180px] text-xs">
                  <SelectValue placeholder="Assign faculty" />
                </SelectTrigger>
                <SelectContent>
                  {data.faculty_options.map((f) => (
                    <SelectItem key={f.user_id} value={f.user_id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                className="h-9 text-xs"
                disabled={saving === role.role_type}
                onClick={() => void saveRole(role.role_type)}
              >
                {saving === role.role_type ? '…' : 'Save'}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </HodPanel>
  );
}
