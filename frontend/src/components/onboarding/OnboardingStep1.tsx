'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Loader2 } from 'lucide-react';
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
import type { PortalOnboardingConfig } from '@/lib/onboarding/portal-onboarding';

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

export function OnboardingStep1({ config }: { config: PortalOnboardingConfig }) {
  const api = useAuthedApi();
  const router = useRouter();
  const { refreshUser } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await api.post(`${config.apiPrefix}/reset-password`, {
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      await refreshUser();
      toast.success('Password updated. Continue to profile setup.');
      router.replace(`${config.portalPrefix}/onboarding/step-2`);
    } catch (err) {
      toast.error(parseApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <OnboardingPanel
      icon={KeyRound}
      title="Create a secure password"
      description={`Replace the default password before accessing the ${config.portalLabel.toLowerCase()} portal. Use at least 8 characters.`}
    >
      <form className="mx-auto max-w-md space-y-5" onSubmit={handleSubmit}>
        <OnboardingField id="current" label="Current password" required>
          <Input
            id="current"
            type="password"
            autoComplete="current-password"
            placeholder="Enter default password"
            className={onboardingInputClass}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </OnboardingField>

        <OnboardingField id="new" label="New password" required hint="Minimum 8 characters">
          <Input
            id="new"
            type="password"
            autoComplete="new-password"
            className={onboardingInputClass}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
          />
        </OnboardingField>

        <OnboardingField id="confirm" label="Confirm new password" required>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            className={onboardingInputClass}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
          />
        </OnboardingField>

        <Button
          type="submit"
          className="mt-2 h-11 w-full rounded-lg bg-sgvu-navy text-base hover:bg-sgvu-navy/90"
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Updating…
            </>
          ) : (
            'Save & continue'
          )}
        </Button>
      </form>
    </OnboardingPanel>
  );
}
