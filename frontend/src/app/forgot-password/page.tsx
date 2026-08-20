'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { FalconLogo } from '@/components/brand/FalconLogo';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await api.forgotPassword(email.trim());
    setMessage('If that account exists, a reset was issued.');
    setToken(res.reset_token ?? null);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-2xl border p-6">
        <FalconLogo variant="full" size={48} />
        <h1 className="text-xl font-bold text-sgvu-navy">Forgot password</h1>
        <input
          type="email"
          required
          className="w-full rounded-xl border px-4 py-3 text-sm"
          placeholder="official email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit" className="w-full rounded-xl bg-sgvu-navy py-3 font-semibold text-white">
          Send reset
        </button>
        {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
        {token ? (
          <p className="break-all text-xs text-muted-foreground">
            Dev token: {token} — use{' '}
            <Link className="underline" href={`/reset-password?token=${token}`}>
              reset page
            </Link>
          </p>
        ) : null}
        <Link href="/" className="block text-center text-sm text-sgvu-navy underline">
          Back to login
        </Link>
      </form>
    </div>
  );
}
