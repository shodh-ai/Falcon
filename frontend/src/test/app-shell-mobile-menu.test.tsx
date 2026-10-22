import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import type { AppTopBar } from '@/components/layout/AppTopBar';
import { AppShell } from '@/components/layout/AppShell';
import { examCellPortal, financePortal } from '@/lib/navigation';

const route = vi.hoisted(() => ({ pathname: '/exam-cell/dashboard' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { role: 'ExamCell' } }) }));
vi.mock('@/context/ModuleRuntimeContext', () => ({ useModuleRuntime: () => ({ manifest: null }) }));
vi.mock('@/lib/sidebar-ui-state', () => ({
  getSidebarCollapsedServerSnapshot: () => false,
  getSidebarCollapsedSnapshot: () => false,
  subscribeSidebarCollapsed: () => () => {},
  writeSidebarCollapsed: vi.fn(),
}));
vi.mock('@/components/layout/AppSidebar', () => ({ AppSidebar: () => <aside>Existing sidebar</aside> }));
vi.mock('@/components/layout/AppTopBar', () => ({
  AppTopBar: ({ mobileOpen, onMobileOpenChange }: ComponentProps<typeof AppTopBar>) => (
    <header>
      <button onClick={() => onMobileOpenChange(true)}>Open test menu</button>
      <button onClick={() => onMobileOpenChange(false)}>Close test menu</button>
      <output aria-label="Test menu state">{mobileOpen ? 'open' : 'closed'}</output>
    </header>
  ),
}));

beforeEach(() => { route.pathname = '/exam-cell/dashboard'; });

describe('AppShell mobile menu route lifecycle', () => {
  it.each([examCellPortal, financePortal])('closes the $personaLabel menu after navigation and does not reopen it on browser back', (config) => {
    route.pathname = config.homeHref;
    const { rerender } = render(<AppShell config={config}>Existing workflow</AppShell>);
    fireEvent.click(screen.getByRole('button', { name: 'Open test menu' }));
    expect(screen.getByLabelText('Test menu state')).toHaveTextContent('open');
    route.pathname = `${config.homeHref}/next`;
    rerender(<AppShell config={config}>Next workflow</AppShell>);
    expect(screen.getByLabelText('Test menu state')).toHaveTextContent('closed');
    route.pathname = config.homeHref;
    rerender(<AppShell config={config}>Existing workflow</AppShell>);
    expect(screen.getByLabelText('Test menu state')).toHaveTextContent('closed');
    fireEvent.click(screen.getByRole('button', { name: 'Open test menu' }));
    rerender(<AppShell config={config}>Refreshed workflow</AppShell>);
    expect(screen.getByLabelText('Test menu state')).toHaveTextContent('open');
    fireEvent.click(screen.getByRole('button', { name: 'Close test menu' }));
    expect(screen.getByLabelText('Test menu state')).toHaveTextContent('closed');
  });
});
