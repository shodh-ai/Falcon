'use client';

import { FalconLogo } from '@/components/brand/FalconLogo';
import { useAuth } from '@/context/AuthContext';
import { BarChart3, Clock3, HelpCircle, History, LayoutDashboard, LogOut, Repeat2, UserCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import React from 'react';

const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard', active: true },
  { label: 'My Profile', icon: UserCircle, href: '/dashboard?section=profile' },
  { label: 'Upload History', icon: History, href: '/dashboard?section=uploads' },
  { label: 'Help/Support', icon: HelpCircle, href: '/dashboard?section=support' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleNavigation = (href: string) => {
    window.history.pushState({}, '', href);
    window.dispatchEvent(new Event('dashboard-section-change'));
  };

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-72 border-r border-[#d6b65d]/30 bg-[#08234a] text-white shadow-xl lg:flex lg:flex-col">
        <div className="flex h-20 items-center gap-3 border-b border-white/10 px-6">
          <FalconLogo size={56} />
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#d6b65d]">Falcon</p>
            <p className="text-sm font-medium text-blue-100">SGVU Workspace</p>
          </div>
        </div>

        <nav className="flex-1 space-y-2 px-4 py-6">
          {[...navItems, ...(user?.role === 'IQAC' || user?.role === 'HR' ? [{ label: 'Handover', icon: Repeat2, href: '/dashboard?section=handover' }] : [])].map((item) => {
            const Icon = item.icon;
            return (
              <a
                key={item.label}
                href={item.href}
                onClick={(event) => {
                  event.preventDefault();
                  handleNavigation(item.href);
                }}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${
                  item.active
                    ? 'bg-[#d6b65d] text-[#08234a] shadow-md'
                    : 'text-blue-100 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </a>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="rounded-2xl bg-white/10 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#d6b65d] font-bold text-[#08234a]">
                {user?.name?.charAt(0) || 'U'}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{user?.name}</p>
                <p className="truncate text-xs text-blue-100">{user?.role}</p>
              </div>
            </div>
            <button
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
          <div className="flex h-20 items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3 lg:hidden">
              <FalconLogo size={48} compact />
              <div>
                <p className="font-black text-[#08234a]">Falcon</p>
                <p className="text-xs font-medium text-slate-500">SGVU Workspace</p>
              </div>
            </div>
            <div className="hidden lg:block">
              <p className="text-sm font-medium text-[#d6b65d]">Powered by Falcon</p>
              <h1 className="text-2xl font-black text-[#08234a]">Falcon Core</h1>
            </div>
            <div className="flex items-center gap-3 rounded-2xl bg-[#08234a]/5 px-4 py-2">
              <BarChart3 className="h-5 w-5 text-[#d6b65d]" />
              <div className="text-right">
                <p className="text-sm font-semibold text-[#08234a]">{user?.name}</p>
                <p className="text-xs text-slate-500">{user?.role}</p>
              </div>
            </div>
          </div>
        </header>

        <main className="px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

export function EmptyTaskState({
  onCheckTasks,
  checking = false,
}: {
  onCheckTasks?: () => void | Promise<void>;
  checking?: boolean;
} = {}) {
  const handleCheckTasks = () => {
    void (async () => {
      if (onCheckTasks) {
        await onCheckTasks();
        return;
      }
      window.location.reload();
    })();
  };

  const handleViewCalendar = () => {
    const path = window.location.pathname || '/dashboard';
    const next = `${path}?section=calendar`;
    window.history.pushState({}, '', next);
    window.dispatchEvent(new Event('dashboard-section-change'));
  };

  const primaryBtn =
    'rounded-xl border border-[#0B2447] bg-[#0B2447] px-5 py-3 text-sm font-semibold text-white shadow-md transition-colors hover:bg-[#123A6D] active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy disabled:cursor-not-allowed disabled:opacity-60';
  const secondaryBtn =
    'rounded-xl border border-[#0B2447] bg-white px-5 py-3 text-sm font-semibold text-[#0B2447] transition-colors hover:bg-[#0B2447]/5 active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy';

  return (
    <div className="rounded-3xl border border-dashed border-[#d6b65d]/70 bg-gradient-to-br from-white to-[#fff8e1] p-8 text-center shadow-sm">
      <div className="mx-auto mb-6 flex h-40 max-w-xs items-center justify-center rounded-[2rem] bg-[#08234a] p-6 shadow-xl shadow-[#08234a]/10">
        <div className="relative h-24 w-28">
          <div className="absolute left-3 top-4 h-20 w-16 rotate-[-8deg] rounded-xl bg-white shadow-lg" />
          <div className="absolute left-9 top-1 h-20 w-16 rotate-[8deg] rounded-xl bg-[#d6b65d] shadow-lg" />
          <Clock3 className="absolute bottom-3 left-10 h-10 w-10 rounded-full bg-white p-2 text-[#08234a] shadow" />
        </div>
      </div>
      <h3 className="text-xl font-bold text-[#08234a]">No active tasks assigned yet</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
        Your monthly governance tasks will appear here when IQAC distributes assignments for your role and department.
      </p>
      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
        <button type="button" onClick={handleCheckTasks} disabled={checking} className={primaryBtn}>
          {checking ? 'Checking…' : 'Check for New Tasks'}
        </button>
        <button type="button" onClick={handleViewCalendar} className={secondaryBtn}>
          View Yearly Calendar
        </button>
      </div>
    </div>
  );
}
