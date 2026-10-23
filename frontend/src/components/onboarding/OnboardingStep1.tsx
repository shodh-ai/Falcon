'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { useAuthedApi } from '@/lib/api';
import {
  OnboardingField,
  OnboardingPanel,
  onboardingInputClass,
} from '@/components/onboarding/onboarding-ui';
import {
  getOnboardingStepPath,
  isFirstLoginOnboardingComplete,
  type PortalOnboardingConfig,
} from '@/lib/onboarding/portal-onboarding';
import { cn } from '@/lib/utils';

const MAX_PASSWORD_LENGTH = 128;

const btnIdle =
  'mt-2 h-11 w-full rounded-lg border border-[#0B2447] bg-[#0B2447] text-base font-semibold text-white transition-colors hover:bg-[#123A6D] hover:text-white active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy disabled:pointer-events-none disabled:opacity-50';
const btnBusy =
  'mt-2 h-11 w-full rounded-lg border border-sgvu-gold bg-sgvu-gold text-base font-semibold text-sgvu-navy';

function parseApiError(err: unknown) {
  if (!(err instanceof Error)) return 'Something went wrong';
  try {
    const parsed = JSON.parse(err.message) as { message?: string | string[] };
    if (Array.isArray(parsed.message)) return parsed.message.join(', ');
    if (parsed.message) return parsed.message;
  } catch {
    /* plain text */
  }
  return err.message;
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

function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  placeholder,
  disabled,
  describedBy,
  invalid,
  minLength,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  placeholder?: string;
  disabled?: boolean;
  describedBy?: string;
  invalid?: boolean;
  minLength?: number;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className={cn(onboardingInputClass, 'pr-11')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        minLength={minLength}
        maxLength={MAX_PASSWORD_LENGTH}
        disabled={disabled}
        aria-invalid={invalid}
        aria-describedby={describedBy}
      />
      <button
        type="button"
        className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sgvu-navy/5 hover:text-sgvu-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgvu-gold/40"
        onClick={() => setVisible((v) => !v)}
        disabled={disabled}
        aria-label={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
      </button>
    </div>
  );
}

export function OnboardingStep1({ config }: { config: PortalOnboardingConfig }) {
  const { token, user } = useAuth();
  return <OnboardingStep1Form key={`${user?.user_id ?? ''}:${token ?? ''}:${config.portalPrefix}`} config={config} />;
}

function OnboardingStep1Form({ config }: { config: PortalOnboardingConfig }) {
  const api = useAuthedApi();
  const router = useRouter();
  const { updateOnboardingStatus } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const mounted = useRef(false);
  const saving = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const strength = useMemo(() => passwordStrength(newPassword), [newPassword]);
  const mismatchHint = useMemo(() => {
    if (!confirmPassword) return null;
    if (newPassword !== confirmPassword) return 'Passwords do not match';
    return null;
  }, [newPassword, confirmPassword]);

  const canSubmit = useMemo(
    () => validatePasswordForm(currentPassword, newPassword, confirmPassword) === null && !loading,
    [currentPassword, newPassword, confirmPassword, loading],
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!mounted.current || saving.current) return;
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

    saving.current = true;
    setFormError(null);
    setLoading(true);
    try {
      const result = await api.post<{ onboarding_status: string | null; password_changed?: boolean }>(
        `${config.apiPrefix}/reset-password`,
        {
          current_password: currentPassword,
          new_password: newPassword,
          confirm_password: confirmPassword,
        },
      );
      if (!mounted.current) return;
      const nextStep = getOnboardingStepPath(
        config.portalPrefix,
        result.onboarding_status,
        config.portalLabel.toLowerCase(),
      );
      if (
        !result.onboarding_status ||
        nextStep === `${config.portalPrefix}/onboarding/step-1` ||
        (!nextStep && !isFirstLoginOnboardingComplete(result.onboarding_status, config.portalLabel.toLowerCase()))
      ) {
        throw new Error('Your password setup has not completed. Please try saving again.');
      }
      if (updateOnboardingStatus(result.onboarding_status) === false) return;
      toast.success(result.password_changed === false
        ? 'Password setup is already complete. Continuing onboarding.'
        : 'Password updated. Continue to profile setup.');
      router.replace(nextStep ?? config.dashboardPath);
    } catch (err) {
      if (!mounted.current) return;
      const message = parseApiError(err);
      // A previous save may have advanced the account while this tab still
      // shows the password step. Read the onboarding endpoint's own status so
      // stale auth profile data cannot keep the user on a step the API rejects.
      const needsStatusReconciliation =
        err instanceof Error &&
        /400|password reset is not required/i.test(`${err.message} ${message}`);
      if (needsStatusReconciliation) {
        try {
          const status = await api.get<{ onboarding_status?: string }>(
            `${config.apiPrefix}/status`,
          );
          if (!mounted.current) return;
          if (
            status.onboarding_status &&
            (['PENDING_DOCUMENTS', 'PENDING_ADMIN_APPROVAL'].includes(status.onboarding_status) ||
              isFirstLoginOnboardingComplete(status.onboarding_status, config.portalLabel))
          ) {
            // The portal guard also reads AuthContext. Synchronize it from
            // this authoritative onboarding status before routing.
            if (updateOnboardingStatus(status.onboarding_status) === false) return;
            const nextStep = getOnboardingStepPath(
              config.portalPrefix,
              status.onboarding_status,
              config.portalLabel.toLowerCase(),
            );
            router.replace(nextStep ?? config.dashboardPath);
            return;
          }
        } catch {
          // Keep the original API message visible if status cannot be loaded.
        }
      }
      if (!mounted.current) return;
      setFormError(message);
      toast.error(message);
    } finally {
      if (mounted.current) { saving.current = false; setLoading(false); }
    }
  };

  return (
    <OnboardingPanel
      icon={KeyRound}
      title="Create a secure password"
      description={`Replace the default password before accessing the ${config.portalLabel.toLowerCase()} portal. Use at least 8 characters.`}
    >
      <form className="mx-auto max-w-md space-y-5" onSubmit={(e) => void handleSubmit(e)} noValidate>
        <OnboardingField id="current" label="Current password" required>
          <PasswordInput
            id="current"
            autoComplete="current-password"
            placeholder="Enter default password"
            value={currentPassword}
            onChange={(v) => {
              setCurrentPassword(v);
              setFormError(null);
            }}
            disabled={loading}
            invalid={Boolean(formError)}
          />
        </OnboardingField>

        <OnboardingField id="new" label="New password" required hint="Minimum 8 characters">
          <PasswordInput
            id="new"
            autoComplete="new-password"
            value={newPassword}
            onChange={(v) => {
              setNewPassword(v);
              setFormError(null);
            }}
            disabled={loading}
            describedBy="onboarding-password-strength"
            invalid={Boolean(formError || mismatchHint)}
            minLength={8}
          />
          {newPassword ? (
            <div id="onboarding-password-strength" className="mt-2 space-y-1.5">
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
        </OnboardingField>

        <OnboardingField id="confirm" label="Confirm new password" required>
          <PasswordInput
            id="confirm"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(v) => {
              setConfirmPassword(v);
              setFormError(null);
            }}
            disabled={loading}
            invalid={Boolean(mismatchHint || formError)}
            minLength={8}
          />
        </OnboardingField>

        {mismatchHint || formError ? (
          <p className="text-sm font-medium text-destructive" role="alert">
            {mismatchHint ?? formError}
          </p>
        ) : null}

        <Button
          type="submit"
          variant="outline"
          className={loading ? btnBusy : btnIdle}
          disabled={!canSubmit}
          aria-busy={loading}
        >
          {loading ? 'Updating…' : 'Save & continue'}
        </Button>
      </form>
    </OnboardingPanel>
  );
}
