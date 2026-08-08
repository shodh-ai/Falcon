'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bell,
  Eye,
  EyeOff,
  FileSignature,
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
  getActiveWorkspaceRoleFromPath,
} from '@/lib/auth-routing';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { FacultyDetailsSettingsSection } from '@/components/settings/FacultyDetailsSettingsSection';
import { cn } from '@/lib/utils';
import {
  DEFAULT_NOTIF_PREFS,
  loadNotificationPrefs,
  saveNotificationPrefs,
  type NotificationPrefs,
} from '@/lib/notifications/account-prefs';

const btnIdle =
  'h-10 border border-[#0B2447] bg-[#0B2447] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#123A6D] hover:text-white active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy disabled:opacity-60';
const btnBusy =
  'h-10 border border-sgvu-gold bg-sgvu-gold px-5 text-sm font-semibold text-sgvu-navy';
const btnOutline =
  'h-10 border border-[#0B2447] bg-white px-5 text-sm font-semibold text-[#0B2447] transition-colors hover:bg-[#0B2447]/5 active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy';
const labelClass = 'text-xs font-bold uppercase tracking-wide text-sgvu-navy/55';
const fieldClass =
  'h-10 rounded-lg border-sgvu-navy/20 pr-10 focus-visible:ring-sgvu-gold/40';

const MAX_PASSWORD_LENGTH = 128;

function canAccessDigitalSignature(workspaceRole: string): boolean {
  const role = workspaceRole.toLowerCase();
  return (
    role.includes('registrar') ||
    role.includes('campusadmin') ||
    role.includes('superadmin') ||
    role === 'admin'
  );
}

function canEditFacultyProfile(pathname: string, workspaceRole: string): boolean {
  if (
    pathname.startsWith('/faculty') ||
    pathname.startsWith('/hod') ||
    pathname.startsWith('/dean')
  ) {
    return true;
  }
  const role = workspaceRole.toLowerCase();
  return role === 'faculty' || role === 'hod' || role === 'dean';
}

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
    <section className="rounded-2xl border border-sgvu-navy/10 bg-white p-5 shadow-sm md:p-6">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sgvu-navy/10 text-sgvu-navy">
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0">
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

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  disabled,
  describedBy,
  invalid,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  disabled?: boolean;
  describedBy?: string;
  invalid?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          className={fieldClass}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          minLength={8}
          maxLength={MAX_PASSWORD_LENGTH}
          required
          aria-required="true"
          aria-invalid={invalid}
          aria-describedby={describedBy}
          disabled={disabled}
        />
        <button
          type="button"
          className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sgvu-navy/5 hover:text-sgvu-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgvu-gold/40"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          tabIndex={0}
        >
          {visible ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
        </button>
      </div>
    </div>
  );
}

function passwordStrength(password: string): { score: number; label: string; color: string } {
  if (!password) return { score: 0, label: '', color: 'bg-muted' };
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  if (score <= 2) return { score, label: 'Weak', color: 'bg-red-500' };
  if (score <= 3) return { score, label: 'Fair', color: 'bg-amber-500' };
  if (score <= 4) return { score, label: 'Good', color: 'bg-emerald-500' };
  return { score, label: 'Strong', color: 'bg-emerald-600' };
}

function validatePasswordForm(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string,
): string | null {
  if (!currentPassword.trim()) return 'Current password is required';
  if (!newPassword.trim()) return 'New password is required';
  if (newPassword.length < 8) return 'Password must be at least 8 characters';
  if (newPassword.length > MAX_PASSWORD_LENGTH) {
    return `Password must be at most ${MAX_PASSWORD_LENGTH} characters`;
  }
  if (newPassword === 'password123') {
    return 'Please choose a password different from the default';
  }
  if (newPassword === currentPassword) {
    return 'New password must be different from your current password';
  }
  if (newPassword !== confirmPassword) {
    return 'New password and confirmation do not match';
  }
  return null;
}

function PrefToggle({
  id,
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-sgvu-navy/10 px-4 py-3">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-semibold text-sgvu-navy">
          {label}
        </label>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgvu-gold/40 disabled:opacity-60',
          checked ? 'bg-[#0B2447]' : 'bg-slate-300',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform',
            checked ? 'left-5' : 'left-0.5',
          )}
        />
      </button>
    </div>
  );
}

function AccountSkeleton() {
  return (
    <div className="grid animate-pulse gap-4 sm:grid-cols-2" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="space-y-2">
          <div className="h-3 w-16 rounded bg-sgvu-navy/10" />
          <div className="h-5 w-40 rounded bg-sgvu-navy/10" />
        </div>
      ))}
    </div>
  );
}

export function AccountSettingsPage() {
  const api = useAuthedApi();
  const { user, refreshUser, logout, isLoading } = useAuth();
  const pathname = usePathname();
  const workspaceRole =
    getActiveWorkspaceRoleFromPath(pathname, user?.roles ?? [user?.role ?? 'User']) ??
    user?.primaryRole ??
    user?.role ??
    'User';
  const profileHref = getProfileHrefFromPath(pathname, workspaceRole);
  const showFacultyProfileEditor = canEditFacultyProfile(pathname, workspaceRole);
  const showDigitalSignature = canAccessDigitalSignature(workspaceRole);
  const digitalSignatureHref = '/admin/account/settings/digital-signature';

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIF_PREFS);
  const [prefsReady, setPrefsReady] = useState(false);

  useEffect(() => {
    setNotifPrefs(loadNotificationPrefs());
    setPrefsReady(true);
  }, []);

  const mismatchHint = useMemo(() => {
    if (!confirmPassword) return null;
    if (newPassword !== confirmPassword) return 'Passwords do not match';
    return null;
  }, [newPassword, confirmPassword]);

  const strength = useMemo(() => passwordStrength(newPassword), [newPassword]);

  function updateNotifPref<K extends keyof NotificationPrefs>(key: K, value: NotificationPrefs[K]) {
    setNotifPrefs((prev) => {
      const next = { ...prev, [key]: value };
      try {
        saveNotificationPrefs(next);
        window.dispatchEvent(new Event('falcon:account-prefs-changed'));
      } catch {
        toast.error('Could not save preference on this device');
      }
      return next;
    });
    toast.success('Preference saved for this device');
  }

  async function handleDesktopToggle(next: boolean) {
    if (next && typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'denied') {
        toast.error('Browser notifications are blocked. Enable them in browser settings.');
        return;
      }
      if (Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          toast.error('Desktop notifications were not granted');
          return;
        }
      }
    }
    updateNotifPref('browserDesktop', next);
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validatePasswordForm(
      currentPassword,
      newPassword,
      confirmPassword,
    );
    if (validationError) {
      setFormError(validationError);
      toast.error(validationError);
      return;
    }

    setFormError(null);
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
      const message = err instanceof Error ? err.message : 'Could not update password';
      setFormError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 p-4 md:p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <p className="text-sm font-semibold text-sgvu-gold">Falcon Workspace</p>
          <h1 className="text-2xl font-bold text-sgvu-navy">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your account, contact details, security, and workspace preferences.
          </p>
        </CardContent>
      </Card>

      {showFacultyProfileEditor ? (
        <FacultyDetailsSettingsSection profileHref={profileHref} />
      ) : null}

      <SettingsSection
        title="Account"
        description="Your workspace identity and sign-in email."
        icon={User}
      >
        {isLoading && !user ? (
          <AccountSkeleton />
        ) : (
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className={labelClass}>Name</dt>
              <dd className="mt-1.5 font-medium text-sgvu-navy">{user?.name ?? '—'}</dd>
            </div>
            <div>
              <dt className={labelClass}>Email</dt>
              <dd className="mt-1.5 flex min-w-0 items-center gap-2 font-medium text-sgvu-navy">
                <Mail className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate">{user?.email ?? '—'}</span>
              </dd>
            </div>
            <div>
              <dt className={labelClass}>Workspace</dt>
              <dd className="mt-1.5">
                <Badge variant="secondary">{getWorkspaceLabelForRole(workspaceRole)}</Badge>
              </dd>
            </div>
            {profileHref !== pathname ? (
              <div>
                <dt className={labelClass}>Profile</dt>
                <dd className="mt-1.5">
                  <Link
                    href={profileHref}
                    className="text-sm font-semibold text-sgvu-navy underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgvu-gold/40"
                  >
                    Open full profile
                  </Link>
                </dd>
              </div>
            ) : null}
          </dl>
        )}
      </SettingsSection>

      {showDigitalSignature ? (
        <SettingsSection
          title="Digital Signature & Credentials"
          description="Manage your official university digital signature, DSC status, and document signing."
          icon={FileSignature}
        >
          <p className="mb-4 text-sm text-muted-foreground">
            Upload your signature image, monitor certificate expiry, digitally sign degree certificates,
            transcripts, appointment letters, and other approved documents.
          </p>
          <Button asChild variant="outline" className={btnIdle}>
            <Link href={digitalSignatureHref}>Open Digital Signature &amp; Credentials</Link>
          </Button>
        </SettingsSection>
      ) : null}

      <SettingsSection
        title="Password & security"
        description="Update your password. You will stay signed in on this device."
        icon={KeyRound}
      >
        <form className="space-y-4" onSubmit={(e) => void handleChangePassword(e)} noValidate>
          <PasswordField
            id="current-password"
            label="Current password"
            value={currentPassword}
            onChange={(v) => {
              setCurrentPassword(v);
              setFormError(null);
            }}
            autoComplete="current-password"
            disabled={submitting}
            invalid={Boolean(formError)}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <PasswordField
              id="new-password"
              label="New password"
              value={newPassword}
              onChange={(v) => {
                setNewPassword(v);
                setFormError(null);
              }}
              autoComplete="new-password"
              disabled={submitting}
              describedBy="password-hint password-strength"
              invalid={Boolean(formError || mismatchHint)}
            />
            <PasswordField
              id="confirm-password"
              label="Confirm new password"
              value={confirmPassword}
              onChange={(v) => {
                setConfirmPassword(v);
                setFormError(null);
              }}
              autoComplete="new-password"
              disabled={submitting}
              invalid={Boolean(mismatchHint || formError)}
            />
          </div>
          {newPassword ? (
            <div id="password-strength" className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Password strength</span>
                <span className="font-semibold text-sgvu-navy">{strength.label}</span>
              </div>
              <div className="flex gap-1" aria-hidden>
                {[1, 2, 3, 4, 5].map((step) => (
                  <div
                    key={step}
                    className={cn(
                      'h-1.5 flex-1 rounded-full',
                      step <= strength.score ? strength.color : 'bg-sgvu-navy/10',
                    )}
                  />
                ))}
              </div>
            </div>
          ) : null}
          <p id="password-hint" className="text-xs text-muted-foreground">
            Use at least 8 characters (max {MAX_PASSWORD_LENGTH}). Mix letters, numbers, and symbols.
            Avoid common defaults like password123.
          </p>
          {mismatchHint || formError ? (
            <p className="text-sm font-medium text-destructive" role="alert">
              {mismatchHint ?? formError}
            </p>
          ) : null}
          <div className="flex justify-center border-t border-sgvu-navy/10 pt-4">
            <Button
              type="submit"
              variant="outline"
              className={submitting ? btnBusy : btnIdle}
              disabled={submitting}
              aria-busy={submitting}
            >
              {submitting ? 'Updating…' : 'Update password'}
            </Button>
          </div>
        </form>
      </SettingsSection>

      <SettingsSection
        title="Notifications"
        description="Device preferences for alerts. Institution email digests are managed separately."
        icon={Bell}
      >
        <div className="space-y-3">
          <PrefToggle
            id="pref-in-app"
            label="In-app alerts"
            description="Show alerts in the top-bar notification bell on this device."
            checked={notifPrefs.inAppAlerts}
            onChange={(v) => updateNotifPref('inAppAlerts', v)}
            disabled={!prefsReady}
          />
          <PrefToggle
            id="pref-exam"
            label="Exam workflow reminders"
            description="Highlight examination deadlines and result actions on this device."
            checked={notifPrefs.examReminders}
            onChange={(v) => updateNotifPref('examReminders', v)}
            disabled={!prefsReady}
          />
          <PrefToggle
            id="pref-desktop"
            label="Browser desktop notifications"
            description="Allow this browser to show desktop notifications when permitted."
            checked={notifPrefs.browserDesktop}
            onChange={(v) => void handleDesktopToggle(v)}
            disabled={!prefsReady}
          />
          <p className="text-xs text-muted-foreground">
            These preferences are stored on this device only. Server-side channel routing is controlled by
            your institution.
          </p>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Privacy & access"
        description="Session and access controls for your Falcon account."
        icon={Shield}
      >
        <ul className="mb-4 list-inside list-disc space-y-2 text-sm text-muted-foreground">
          <li>Sign in with your official university email.</li>
          <li>Your role controls which portals and modules you can access.</li>
          <li>Contact HR or IT if you need access changes or account deactivation.</li>
        </ul>
        <div className="flex flex-wrap gap-3 border-t border-sgvu-navy/10 pt-4">
          {profileHref !== pathname ? (
            <Button asChild variant="outline" className={btnOutline}>
              <Link href={profileHref}>View profile</Link>
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className={btnOutline}
            onClick={() => {
              logout();
              toast.success('Signed out of this device');
            }}
          >
            Sign out
          </Button>
        </div>
      </SettingsSection>
    </div>
  );
}
