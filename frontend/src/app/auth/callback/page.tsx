'use client';

import { FalconLoader } from '@/components/brand/FalconLoader';
import { useAuth } from '@/context/AuthContext';
import { getDashboardPathForRole } from '@/lib/auth-routing';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function AuthCallbackPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');

    if (!token) {
      setError('Missing authentication token. Please try signing in again.');
      return;
    }

    const completeLogin = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
        const response = await fetch(`${apiUrl}/auth/profile`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error('Unable to fetch user profile.');
        }

        const user = await response.json();
        login(token, user);
        router.replace(getDashboardPathForRole(user.primaryRole ?? user.role));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Authentication failed.');
      }
    };

    completeLogin();
  }, [login, router]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sgvu-surface px-4">
        <div className="w-full max-w-md rounded-2xl border bg-background p-6 text-center shadow-sm">
          <h1 className="mb-2 text-xl font-black text-sgvu-navy">Sign in failed</h1>
          <p className="mb-6 text-sm font-medium text-muted-foreground">{error}</p>
          <button
            onClick={() => router.replace('/')}
            className="rounded-xl bg-sgvu-navy px-4 py-2.5 text-sm font-semibold text-white hover:bg-sgvu-navy/90"
          >
            Back to Falcon login
          </button>
        </div>
      </div>
    );
  }

  return <FalconLoader label="Completing Falcon sign in…" className="min-h-screen bg-sgvu-surface" />;
}
