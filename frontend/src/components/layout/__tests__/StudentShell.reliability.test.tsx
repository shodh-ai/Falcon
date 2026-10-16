import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { PortalConfig } from '@/lib/navigation';
import { StudentShell } from '@/components/layout/StudentShell';

const mocks = vi.hoisted(() => ({
  api: { post: vi.fn() },
  coordinator: vi.fn(),
  roles: ['Student'],
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'token', user: { role: mocks.roles[0], roles: mocks.roles } }) }));
vi.mock('@/context/ModuleRuntimeContext', () => ({ useModuleRuntime: () => ({ module: () => ({ available: true }) }) }));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => mocks.api }));
vi.mock('@/lib/api/api.campus-events', () => ({ createCampusEventsApi: () => ({ isClubCoordinator: mocks.coordinator }) }));
vi.mock('@/components/layout/AppShell', () => ({
  AppShell: ({ config, children }: { config: PortalConfig; children: ReactNode }) => <div>
    <a href={config.homeHref}>Home</a>
    {config.commandItems.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}
    {children}
  </div>,
}));

describe('Student shell initialization', () => {
  beforeEach(() => {
    mocks.roles = ['Student'];
    mocks.api.post.mockReset().mockResolvedValue({});
    mocks.coordinator.mockReset().mockResolvedValue({ is_coordinator: false });
  });
  it('shows a failed enrollment sync and supports recovery', async () => {
    mocks.api.post.mockRejectedValueOnce(new Error('offline'));
    render(<StudentShell>Student content</StudentShell>);
    expect(await screen.findByRole('alert')).toHaveTextContent('Course enrollment sync is unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry enrollment sync' }));
    await waitFor(() => expect(mocks.api.post).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.getByText('Student content')).toBeInTheDocument();
  });
  it('does not bootstrap enrollments or check coordinator access for a pure Applicant', () => {
    mocks.roles = ['Applicant'];
    render(<StudentShell>Applicant content</StudentShell>);
    expect(mocks.api.post).not.toHaveBeenCalled();
    expect(mocks.coordinator).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/student/profile');
    expect(screen.queryByRole('link', { name: 'Results' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Dashboard' })).toBeNull();
    expect(screen.getByRole('link', { name: 'My Profile' })).toBeInTheDocument();
  });
});
