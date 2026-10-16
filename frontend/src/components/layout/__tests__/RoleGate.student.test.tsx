import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoleGate } from '@/components/layout/RoleGate';
import type { RuntimeModuleManifest } from '@/lib/launch-modules';

const state = vi.hoisted(() => ({ pathname: '/student/marks', roles: ['Student'], replace: vi.fn(), manifest: null as RuntimeModuleManifest | null }));
const router = { replace: state.replace };
vi.mock('next/navigation', () => ({ usePathname: () => state.pathname, useRouter: () => router }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { role: state.roles[0], roles: state.roles }, isAuthenticated: true, isLoading: false }) }));
vi.mock('@/context/ModuleRuntimeContext', () => ({ useModuleRuntime: () => ({ manifest: state.manifest, loading: false }) }));

describe('Student direct route gate', () => {
  beforeEach(() => { vi.useFakeTimers(); state.roles = ['Student']; state.pathname = '/student/marks'; state.manifest = null; state.replace.mockReset(); });
  afterEach(() => { vi.useRealTimers(); });

  it('does not render a disabled module page or its API-producing children', () => {
    state.manifest = { revision: 'test', generatedAt: '', cacheSeconds: 30, modules: [{ moduleKey: 'examinations_credentials', displayName: 'Examinations', state: 'OFF', available: false, revision: 1, sourceScope: 'TENANT', updatedAt: null }] };
    const child = vi.fn(() => <div>Private marks</div>);
    const Child = child;
    render(<RoleGate><Child /></RoleGate>);
    expect(screen.getByText('Module not available')).toBeInTheDocument();
    expect(child).not.toHaveBeenCalled();
    act(() => vi.runAllTimers());
    expect(state.replace).not.toHaveBeenCalled();
  });

  it('redirects an Applicant to an allowed profile instead of the denied dashboard', () => {
    state.roles = ['Applicant'];
    state.pathname = '/student/dashboard';
    const view = render(<RoleGate><div>Student dashboard</div></RoleGate>);
    expect(screen.queryByText('Student dashboard')).not.toBeInTheDocument();
    act(() => vi.runAllTimers());
    expect(state.replace).toHaveBeenCalledWith('/student/profile');
    state.pathname = '/student/profile';
    view.rerender(<RoleGate><div>Admission profile</div></RoleGate>);
    expect(screen.getByText('Admission profile')).toBeInTheDocument();
  });

  it('redirects a Faculty user attempting a Student route to their own portal', () => {
    state.roles = ['Faculty'];
    render(<RoleGate><div>Private marks</div></RoleGate>);
    act(() => vi.runAllTimers());
    expect(state.replace).toHaveBeenCalledWith('/faculty/dashboard');
  });
});
