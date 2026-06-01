'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getDashboardPathForRole } from '@/lib/auth-routing';
import { FalconLogo } from '@/components/brand/FalconLogo';
import { FalconLoader } from '@/components/brand/FalconLoader';
import { LogIn } from 'lucide-react';

export default function Home() {
  const { isAuthenticated, login, user, isLoading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated && user) {
      router.push(getDashboardPathForRole(user.primaryRole ?? user.role));
    }
  }, [isAuthenticated, user, router]);

  const handleGoogleLogin = () => {
    window.location.href = api.login();
  };

  const handleLocalLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLocalLoading(true);
    setLocalError(null);
    try {
      const result = await api.localLogin(email.trim(), password);
      login(result.token, result.user);
      router.push(getDashboardPathForRole(result.user.primaryRole ?? result.user.role));
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Login failed');
    } finally {
      setLocalLoading(false);
    }
  };

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    if (token) {
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          login(token, data);
          router.push(getDashboardPathForRole(data.primaryRole ?? data.role));
        })
        .catch((err) => console.error('Failed to fetch user profile', err));
    }
  }, [login, router]);

  if (isLoading) {
    return <FalconLoader label="Preparing Falcon Campus OS…" className="min-h-screen" />;
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Brand hero */}
      <section className="relative flex flex-1 flex-col justify-between overflow-hidden bg-sgvu-navy px-8 py-10 text-white lg:px-14 lg:py-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='120' height='120' viewBox='0 0 64 64' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M32 12c-8 6-14 14-14 22 0 8 6 14 14 18 8-4 14-10 14-18 0-8-6-16-14-22z' fill='%23d6b65d'/%3E%3C/svg%3E")`,
            backgroundSize: '120px 120px',
          }}
        />
        <div className="relative z-10">
          <FalconLogo variant="full" size={48} />
        </div>
        <div className="relative z-10 max-w-xl space-y-5 py-10 lg:py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sgvu-gold">
            Suresh Gyan Vihar University
          </p>
          <h1 className="text-4xl font-black leading-tight tracking-tight sm:text-5xl lg:text-[3.25rem]">
            Welcome to Falcon.
          </h1>
          <p className="max-w-lg text-base font-medium leading-relaxed text-blue-100/90 sm:text-lg">
            The unified Campus OS for Suresh Gyan Vihar University — academics, HR, hostel,
            finance, and compliance in one premium workspace.
          </p>
        </div>
        <p className="relative z-10 hidden text-sm font-medium text-blue-200/70 lg:block">
          SGVU Academics, powered by Falcon
        </p>
      </section>

      {/* Auth panel */}
      <section className="flex flex-1 flex-col bg-white">
        <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-md space-y-8">
            <div className="space-y-2">
              <h2 className="text-2xl font-black text-sgvu-navy">Sign in to Falcon</h2>
              <p className="text-sm font-medium text-muted-foreground">
                Use your SGVU Google Workspace account or QA credentials.
              </p>
            </div>

            <div className="space-y-6">
              <button
                type="button"
                onClick={handleGoogleLogin}
                className="flex w-full items-center justify-center gap-3 rounded-xl border-2 border-gray-200 bg-white px-6 py-4 font-medium text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Sign in with Google Workspace
              </button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="bg-white px-3 font-medium text-muted-foreground">
                    or sign in with email
                  </span>
                </div>
              </div>

              <form onSubmit={handleLocalLogin} className="space-y-4">
                <div>
                  <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-gray-700">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="hr@mygyanvihar.com"
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sgvu-gold"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-gray-700">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="password123"
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sgvu-gold"
                    required
                  />
                </div>
                {localError && <p className="text-sm text-red-600">{localError}</p>}
                <button
                  type="submit"
                  disabled={localLoading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-sgvu-navy px-6 py-3.5 font-semibold text-white transition hover:bg-sgvu-navy/90 disabled:opacity-60"
                >
                  {localLoading ? (
                    <span className="inline-flex animate-pulse">
                      <FalconLogo size={20} />
                    </span>
                  ) : (
                    <LogIn className="h-4 w-4" />
                  )}
                  Sign in with Password
                </button>
              </form>

              <p className="text-center text-xs font-medium text-muted-foreground">
                Google: @mygyanvihar.com / @mygyanvihar.org · QA personas use password123
              </p>
            </div>
          </div>
        </div>

        <footer className="border-t border-gray-100 px-6 py-4 text-center text-xs font-medium text-muted-foreground">
          Powered by Falcon © 2026
        </footer>
      </section>
    </div>
  );
}
