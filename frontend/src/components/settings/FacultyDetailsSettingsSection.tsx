'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Phone, Save, UserRound } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { SelfServiceLoadError } from '@/components/self-service/SelfServiceLoadError';

type FacultyProfileSummary = {
  name: string;
  email: string;
  phone: string | null;
  department: string | null;
  designation: string;
  employee_id: string | null;
  personal: {
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
    permanent_address: string | null;
    current_address: string | null;
  };
};

function FormField({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      <div className="mt-2">{children}</div>
    </div>
  );
}

export function FacultyDetailsSettingsSection({ profileHref }: { profileHref: string }) {
  const { user } = useAuth();
  const api = useAuthedApi();
  const [scope, setScope] = useState({ api, revision: 0 });
  if (scope.api !== api) setScope({ api, revision: scope.revision + 1 });
  return <FacultyDetailsWorkspace key={`${user?.tenant_id ?? ''}:${user?.user_id ?? ''}:${scope.revision}`} api={api} profileHref={profileHref} />;
}

function FacultyDetailsWorkspace({ api, profileHref }: { api: ReturnType<typeof useAuthedApi>; profileHref: string }) {
  const { refreshUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState(false);
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null);
  const actionLock = useRef(false);
  const alive = useRef(true);
  const requestId = useRef(0);
  const current = useCallback(() => alive.current, []);
  const [profile, setProfile] = useState<FacultyProfileSummary | null>(null);
  const [form, setForm] = useState({
    phone: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    permanent_address: '',
    current_address: '',
  });

  const loadProfile = useCallback(async () => {
    const request = ++requestId.current;
    const data = await api.get<FacultyProfileSummary>('/api/academics/faculty/profile');
    if (!current() || request !== requestId.current) return;
    setProfile(data);
    setForm({
      phone: data.phone ?? '',
      emergency_contact_name: data.personal.emergency_contact_name ?? '',
      emergency_contact_phone: data.personal.emergency_contact_phone ?? '',
      permanent_address: data.personal.permanent_address ?? '',
      current_address: data.personal.current_address ?? '',
    });
    return data;
  }, [api, current]);

  useLayoutEffect(() => {
    alive.current = true;
    return () => { alive.current = false; requestId.current += 1; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadProfile()
      .catch((err) => {
        if (cancelled || !current()) return;
        setError(err instanceof Error ? err.message : 'Could not load profile');
      })
      .finally(() => { if (!cancelled && current()) setLoading(false); });
    return () => { cancelled = true; requestId.current += 1; };
  }, [loadProfile, retry, current]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (actionLock.current || loading || error || !profile) return;
    actionLock.current = true;
    setRefreshWarning(null);
    setSaving(true);
    try {
      const updated = await api.patch<FacultyProfileSummary>('/api/academics/faculty/profile', {
        phone: form.phone.trim() || null,
        emergency_contact_name: form.emergency_contact_name.trim() || null,
        emergency_contact_phone: form.emergency_contact_phone.trim() || null,
        permanent_address: form.permanent_address.trim() || null,
        current_address: form.current_address.trim() || null,
      });
      if (!current()) return;
      requestId.current += 1;
      setProfile(updated);
      toast.success('Profile details updated');
      try {
        const refreshed = await refreshUser();
        if (current() && !refreshed) setRefreshWarning('Your profile details were saved, but account details could not be refreshed. Refresh the page to update them.');
      } catch {
        if (current()) setRefreshWarning('Your profile details were saved, but account details could not be refreshed. Refresh the page to update them.');
      }
    } catch (err) {
      if (current()) toast.error(err instanceof Error ? err.message : 'Could not save profile');
    } finally {
      if (current()) { actionLock.current = false; setSaving(false); }
    }
  }

  if (loading) {
    return (
      <section className="rounded-2xl border bg-white p-5 shadow-sm md:p-6">
        <p className="text-sm text-muted-foreground">Loading profile details…</p>
      </section>
    );
  }

  if (error) return <SelfServiceLoadError message={error} onRetry={() => { setLoading(true); setError(null); setRetry((n) => n + 1); }} />;
  if (!profile) return null;

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm md:p-6">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sgvu-navy/10 text-sgvu-navy">
          <UserRound className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-sgvu-navy">Profile details</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Update your contact information. Designation and department are managed by HR.
          </p>
        </div>
      </div>

      <dl className="mb-5 grid gap-4 rounded-xl border border-border/60 bg-muted/20 p-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Name
          </dt>
          <dd className="mt-1 font-medium text-sgvu-navy">{profile.name}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Email
          </dt>
          <dd className="mt-1 font-medium text-sgvu-navy">{profile.email}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Designation
          </dt>
          <dd className="mt-1 font-medium text-sgvu-navy">{profile.designation}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Department
          </dt>
          <dd className="mt-1 font-medium text-sgvu-navy">{profile.department ?? '—'}</dd>
        </div>
        {profile.employee_id ? (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Employee ID
            </dt>
            <dd className="mt-1 font-mono text-sm font-medium text-sgvu-navy">
              {profile.employee_id}
            </dd>
          </div>
        ) : null}
      </dl>

      <form className="space-y-4" onSubmit={(e) => void handleSave(e)}>
        <fieldset disabled={saving} className="space-y-4">
        <FormField label="Mobile phone">
          <div className="relative">
            <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              type="tel"
              autoComplete="tel"
              placeholder="10-digit mobile number"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </div>
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Emergency contact name">
            <Input
              value={form.emergency_contact_name}
              onChange={(e) =>
                setForm((f) => ({ ...f, emergency_contact_name: e.target.value }))
              }
            />
          </FormField>
          <FormField label="Emergency contact phone">
            <Input
              type="tel"
              value={form.emergency_contact_phone}
              onChange={(e) =>
                setForm((f) => ({ ...f, emergency_contact_phone: e.target.value }))
              }
            />
          </FormField>
        </div>

        <FormField label="Permanent address">
          <textarea
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgvu-navy/20"
            rows={2}
            value={form.permanent_address}
            onChange={(e) => setForm((f) => ({ ...f, permanent_address: e.target.value }))}
          />
        </FormField>

        <FormField label="Current address">
          <textarea
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgvu-navy/20"
            rows={2}
            value={form.current_address}
            onChange={(e) => setForm((f) => ({ ...f, current_address: e.target.value }))}
          />
        </FormField>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button type="submit" disabled={saving}>
            <Save className="h-4 w-4" />
            {saving ? 'Saving…' : 'Save profile details'}
          </Button>
          <Link
            href={profileHref}
            className="text-sm font-semibold text-sgvu-navy underline-offset-2 hover:underline"
          >
            Qualifications, photo & KYC →
          </Link>
        </div>
        </fieldset>
      </form>
      {refreshWarning && <p role="status" className="mt-3 text-sm text-amber-800">{refreshWarning}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        <Badge variant="secondary">HR-managed: designation, department, joining date</Badge>
        <Badge variant="outline">Bank changes require HR approval</Badge>
      </div>
    </section>
  );
}
