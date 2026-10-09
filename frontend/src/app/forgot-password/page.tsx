'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { FalconLogo } from '@/components/brand/FalconLogo';

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const res = await api.forgotPassword(identifier.trim());
      setMessage(
        res.reset_token
          ? 'A reset token was generated for this development environment.'
          : 'If the account exists, a reset link has been sent. If it does not arrive, contact Campus Admin.',
      );
      setToken(res.reset_token ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start password reset');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-2xl border p-6">
        <FalconLogo variant="full" size={48} />
        <h1 className="text-xl font-bold text-sgvu-navy">Forgot password</h1>
        <input
          type="text"
          required
          className="w-full rounded-xl border px-4 py-3 text-sm"
          placeholder="student ID or official email"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
        />
        <button type="submit" disabled={loading} className="w-full rounded-xl bg-sgvu-navy py-3 font-semibold text-white disabled:opacity-60">
          {loading ? 'Sending…' : 'Send reset'}
        </button>
        {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
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
