'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { FalconLogo } from '@/components/brand/FalconLogo';

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const token = params.get('token')?.trim() ?? '';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (!token) {
      setError('This reset link is missing or invalid');
      return;
    }
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await api.resetPasswordWithToken(token, password);
      setDone(true);
      setPassword('');
      setConfirmPassword('');
      setTimeout(() => router.push('/'), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-2xl border p-6">
        <FalconLogo variant="full" size={48} />
        <h1 className="text-xl font-bold text-sgvu-navy">Reset password</h1>
        <input
          className="w-full rounded-xl border px-4 py-3 text-sm"
          type="password"
          placeholder="New Password (min 8 chars)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />
        <input
          className="w-full rounded-xl border px-4 py-3 text-sm"
          type="password"
          placeholder="Confirm new password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          minLength={8}
          required
        />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {!error && !token ? <p className="text-sm text-red-600">This reset link is missing or invalid</p> : null}
        {done ? <p className="text-sm text-emerald-700">Password updated successfully. Please sign in with your new password.</p> : null}
        <button type="submit" disabled={isSubmitting || done || !token} className="w-full rounded-xl bg-sgvu-navy py-3 font-semibold text-white disabled:opacity-60">
          {isSubmitting ? 'Updating password…' : 'Update password'}
        </button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Loading…</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
