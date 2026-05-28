'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import type { ReactNode } from 'react';

export interface PortalNavItem {
  label: string;
  href: string;
}

export interface PortalShellProps {
  personaLabel: string;
  personaTitle: string;
  navItems: PortalNavItem[];
  children: ReactNode;
}

export function PortalShell({ personaLabel, personaTitle, navItems, children }: PortalShellProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-72 border-r border-[#d6b65d]/30 bg-[#08234a] text-white shadow-xl lg:flex lg:flex-col">
        <div className="border-b border-white/10 px-6 py-6">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#d6b65d]">{personaLabel}</p>
          <h2 className="mt-1 text-lg font-semibold">{personaTitle}</h2>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-6">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                  active
                    ? 'bg-[#d6b65d] text-[#08234a] shadow-md'
                    : 'text-blue-100 hover:bg-white/10 hover:text-white'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="rounded-2xl bg-white/10 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#d6b65d] font-bold text-[#08234a]">
                {user?.name?.charAt(0) ?? 'U'}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{user?.name ?? 'Guest'}</p>
                <p className="truncate text-xs text-blue-100">{user?.role ?? '—'}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-sm text-blue-50 hover:bg-white/10"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-10 border-b border-[#d6b65d]/25 bg-white/90 backdrop-blur">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-[#d6b65d]">{personaLabel}</p>
              <h1 className="text-lg font-semibold text-[#08234a]">{personaTitle}</h1>
            </div>
            <div className="text-right text-xs text-slate-500">
              <p className="font-semibold text-[#08234a]">{user?.name ?? 'Guest'}</p>
              <p>{user?.role ?? 'Unauthenticated'}</p>
            </div>
          </div>
        </header>

        <main className="px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
