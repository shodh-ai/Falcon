import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from '@/components/layout/AppShell';
import { facultyPortal } from '@/lib/navigation';

const mocks = vi.hoisted(() => ({ pathname: '/faculty/dashboard' }));
vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { role: 'Faculty' } }) }));
vi.mock('@/context/ModuleRuntimeContext', () => ({ useModuleRuntime: () => ({ manifest: null }) }));
vi.mock('@/components/layout/AppSidebar', () => ({ AppSidebar: () => null }));
vi.mock('@/components/layout/AppTopBar', () => ({
  AppTopBar: ({ mobileOpen, onMobileOpenChange }: { mobileOpen: boolean; onMobileOpenChange: (open: boolean) => void }) =>
    <button onClick={() => onMobileOpenChange(!mobileOpen)} aria-expanded={mobileOpen}>Menu</button>,
}));

describe('shared shell navigation regression', () => {
  it('keeps Faculty drawer behavior: close after navigation and remain closed after back navigation', () => {
    mocks.pathname = '/faculty/dashboard';
    const { rerender } = render(<AppShell config={facultyPortal}>Faculty page</AppShell>);
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    expect(screen.getByRole('button', { name: 'Menu' })).toHaveAttribute('aria-expanded', 'true');
    mocks.pathname = '/faculty/courses';
    rerender(<AppShell config={facultyPortal}>Faculty course page</AppShell>);
    expect(screen.getByRole('button', { name: 'Menu' })).toHaveAttribute('aria-expanded', 'false');
    mocks.pathname = '/faculty/dashboard';
    rerender(<AppShell config={facultyPortal}>Faculty page</AppShell>);
    expect(screen.getByRole('button', { name: 'Menu' })).toHaveAttribute('aria-expanded', 'false');
  });
});
