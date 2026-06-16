'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogIn, Users } from 'lucide-react';
import { FalconLogo } from '@/components/brand/FalconLogo';
import { FalconLoader } from '@/components/brand/FalconLoader';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { getDashboardPathForRole } from '@/lib/auth-routing';

export default function ParentLoginPage() {
  const router = useRouter();
  const { isAuthenticated, login, user, isLoading } = useAuth();
  const [email, setEmail] = useState('parent1@example.com');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated && user) {
      router.replace(getDashboardPathForRole(user.primaryRole ?? user.role));
    }
  }, [isAuthenticated, user, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await api.localLogin(email.trim(), password);
      login(result.token, result.user);
      router.replace(getDashboardPathForRole(result.user.primaryRole ?? result.user.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  if (isLoading) {
    return <FalconLoader label="Preparing Parent Portal…" className="min-h-screen bg-sgvu-surface" />;
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Brand hero */}
      <section className="relative flex flex-1 flex-col justify-between overflow-hidden bg-sgvu-navy px-8 py-10 text-white lg:px-14 lg:py-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: 'url("/logo.png")',
            backgroundSize: '120px 120px',
          }}
        />
        <div className="relative z-10">
          <FalconLogo variant="full" size={72} />
        </div>
        <div className="relative z-10 max-w-xl space-y-5 py-10 lg:py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sgvu-gold">
            Parent Portal
          </p>
          <h1 className="text-4xl font-black leading-tight tracking-tight sm:text-5xl lg:text-[3.25rem]">
            Stay connected with your child&apos;s journey.
          </h1>
          <p className="max-w-lg text-base font-medium leading-relaxed text-blue-100/90 sm:text-lg">
            Attendance, marks, fees, hostel safety, and bus tracking — everything you need in one
            mobile-first feed.
          </p>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-blue-100/90">
            <Users className="h-4 w-4 text-sgvu-gold" />
            Read-only access to linked student records
          </div>
        </div>
        <p className="relative z-10 hidden text-sm font-medium text-blue-200/70 lg:block">
          Falcon Campus OS · SGVU
        </p>
      </section>

      {/* Auth panel */}
      <section className="flex flex-1 flex-col bg-white">
        <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-md space-y-8">
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-sgvu-gold">Falcon</p>
              <h2 className="text-2xl font-black text-sgvu-navy">Parent sign in</h2>
              <p className="text-sm font-medium text-muted-foreground">
                Use the email and password registered with the university.
              </p>
            </div>

            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-gray-700">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="parent1@example.com"
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
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="password123"
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sgvu-gold"
                  required
                />
              </div>
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-sgvu-navy px-6 py-3.5 font-semibold text-white transition hover:bg-sgvu-navy/90 disabled:opacity-60"
              >
                {loading ? (
                  <span className="inline-flex animate-pulse">
                    <FalconLogo size={20} />
                  </span>
                ) : (
                  <LogIn className="h-4 w-4" />
                )}
                Sign in to Parent Portal
              </button>
            </form>

            <p className="text-center text-xs font-medium text-muted-foreground">
              Demo: parent1@example.com · password123
            </p>

            <p className="text-center text-sm font-medium text-muted-foreground">
              Staff or student?{' '}
              <Link href="/" className="font-semibold text-sgvu-navy underline-offset-2 hover:underline">
                Sign in to Falcon
              </Link>
            </p>
          </div>
        </div>

        <footer className="border-t border-gray-100 px-6 py-4 text-center text-xs font-medium text-muted-foreground">
          Powered by Falcon © 2026
        </footer>
      </section>
    </div>
  );
}
