'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bell,
  KeyRound,
  Mail,
  Shield,
  User,
} from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { useAuth } from '@/context/AuthContext';
import { useAuthedApi } from '@/lib/api';
import {
  getProfileHrefFromPath,
  getWorkspaceLabelForRole,
} from '@/lib/auth-routing';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

function SettingsSection({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description?: string;
  icon: typeof User;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm md:p-6">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sgvu-navy/10 text-sgvu-navy">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-sgvu-navy">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      {children}
    </section>
  );
}

export function AccountSettingsPage() {
  const api = useAuthedApi();
  const { user, refreshUser } = useAuth();
  const pathname = usePathname();
  const workspaceRole = user?.primaryRole ?? user?.role ?? 'User';
  const profileHref = getProfileHrefFromPath(pathname, workspaceRole);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('New password and confirmation do not match');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/api/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      toast.success('Password updated successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      await refreshUser();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update password');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-sgvu-navy md:text-3xl">
          Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your account, security, and workspace preferences.
        </p>
      </div>

      <SettingsSection
        title="Account"
        description="Your workspace identity and sign-in email."
        icon={User}
      >
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Name
            </dt>
            <dd className="mt-1 font-medium text-sgvu-navy">{user?.name ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Email
            </dt>
            <dd className="mt-1 flex items-center gap-2 font-medium text-sgvu-navy">
              <Mail className="h-4 w-4 text-muted-foreground" />
              {user?.email ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Workspace
            </dt>
            <dd className="mt-1">
              <Badge variant="secondary">{getWorkspaceLabelForRole(workspaceRole)}</Badge>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Profile
            </dt>
            <dd className="mt-1">
              <Link
                href={profileHref}
                className="text-sm font-semibold text-sgvu-navy underline-offset-2 hover:underline"
              >
                Open full profile →
              </Link>
            </dd>
          </div>
        </dl>
      </SettingsSection>

      <SettingsSection
        title="Password & security"
        description="Update your password. You will stay signed in on this device."
        icon={KeyRound}
      >
        <form className="space-y-4" onSubmit={(e) => void handleChangePassword(e)}>
          <div className="space-y-2">
            <label htmlFor="current-password" className="text-sm font-medium text-sgvu-navy">
              Current password
            </label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="new-password" className="text-sm font-medium text-sgvu-navy">
                New password
              </label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="confirm-password" className="text-sm font-medium text-sgvu-navy">
                Confirm new password
              </label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Use at least 8 characters. Avoid common defaults like password123.
          </p>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Updating…' : 'Update password'}
          </Button>
        </form>
      </SettingsSection>

      <SettingsSection
        title="Notifications"
        description="In-app alerts for attendance, approvals, and workspace updates."
        icon={Bell}
      >
        <p className="text-sm text-muted-foreground">
          Notification delivery is enabled for your account. Use the bell icon in the top bar to
          review recent alerts. Email digests are managed by your institution.
        </p>
      </SettingsSection>

      <SettingsSection
        title="Privacy & access"
        description="How your account is used across Falcon."
        icon={Shield}
      >
        <ul className="list-inside list-disc space-y-2 text-sm text-muted-foreground">
          <li>Sign in with your official university email.</li>
          <li>Your role controls which portals and modules you can access.</li>
          <li>Contact HR or IT if you need access changes or account deactivation.</li>
        </ul>
      </SettingsSection>
    </div>
  );
}
