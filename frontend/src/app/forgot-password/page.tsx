'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { FalconLogo } from '@/components/brand/FalconLogo';

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const res = await api.forgotPassword(identifier.trim());
      setMessage(
        res.requires_admin_reset
          ? 'No verified university email is linked yet. Contact Campus Admin to reset your student account.'
          : "If an account exists for this email or student ID, you'll receive a password reset link shortly. Please check your inbox and spam folder.",
      );
    } catch {
      setError('Unable to process your request. Please try again later.');
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
        <Link href="/" className="block text-center text-sm text-sgvu-navy underline">
          Back to login
        </Link>
      </form>
    </div>
  );
}
