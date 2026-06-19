'use client';

import { FalconLoader } from '@/components/brand/FalconLoader';
import { useAuth } from '@/context/AuthContext';
import { getPostLoginPath } from '@/lib/auth-routing';
import { getApiBaseUrl } from '@/lib/api-base-url';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function AuthCallbackPage() {
  const { login, refreshUser } = useAuth();
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
        const apiUrl = getApiBaseUrl();
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
        const fresh = await refreshUser();
        router.replace(getPostLoginPath(fresh ?? user));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Authentication failed.');
      }
    };

    completeLogin();
  }, [login, refreshUser, router]);

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
