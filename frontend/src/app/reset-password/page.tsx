'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { FalconLogo } from '@/components/brand/FalconLogo';

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [token, setToken] = useState(params.get('token') ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.resetPasswordWithToken(token.trim(), password);
      setDone(true);
      setTimeout(() => router.push('/'), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-2xl border p-6">
        <FalconLogo variant="full" size={48} />
        <h1 className="text-xl font-bold text-sgvu-navy">Reset password</h1>
        <input
          className="w-full rounded-xl border px-4 py-3 text-sm"
          placeholder="Reset token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          required
        />
        <input
          className="w-full rounded-xl border px-4 py-3 text-sm"
          type="password"
          placeholder="New password (min 8 chars)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {done ? <p className="text-sm text-emerald-700">Password updated. Redirecting…</p> : null}
        <button type="submit" className="w-full rounded-xl bg-sgvu-navy py-3 font-semibold text-white">
          Update password
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
