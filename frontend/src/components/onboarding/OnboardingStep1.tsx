'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LockKeyhole } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { useAuthedApi } from '@/lib/api';
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
    <Card className="border-sgvu-navy/10 shadow-lg">
      <CardHeader>
        <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-sgvu-navy/10">
          <LockKeyhole className="h-5 w-5 text-sgvu-navy" />
        </div>
        <CardTitle className="text-sgvu-navy">Step 1 · Reset Your Password</CardTitle>
        <CardDescription>
          For security, replace the default password before accessing the {config.portalLabel.toLowerCase()} portal.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label htmlFor="current" className="text-sm font-medium">Current Password</label>
            <Input
              id="current"
              type="password"
              autoComplete="current-password"
              placeholder="password123"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="new" className="text-sm font-medium">New Password</label>
            <Input
              id="new"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="confirm" className="text-sm font-medium">Confirm New Password</label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <Button type="submit" className="w-full bg-sgvu-navy hover:bg-sgvu-navy/90" disabled={loading}>
            {loading ? 'Updating…' : 'Save & Continue'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
