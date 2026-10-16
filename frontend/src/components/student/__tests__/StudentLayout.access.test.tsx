import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StudentPortalLayout from '@/app/(portals)/student/layout';
import type { ReactNode } from 'react';

const state = vi.hoisted(() => ({ pathname: '/student/onboarding/step-3', roles: ['Applicant'], replace: vi.fn() }));
const router = { replace: state.replace };
vi.mock('next/navigation', () => ({ usePathname: () => state.pathname, useRouter: () => router }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { role: state.roles[0], roles: state.roles, onboarding_status: 'COMPLETED' }, isAuthenticated: true, isLoading: false }) }));
vi.mock('@/context/ModuleRuntimeContext', () => ({ useModuleRuntime: () => ({ manifest: null, loading: false }) }));
vi.mock('@/components/layout/StudentShell', () => ({ StudentShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }));

describe('Applicant Student layout onboarding recovery', () => {
  beforeEach(() => { vi.useFakeTimers(); state.pathname = '/student/onboarding/step-3'; state.roles = ['Applicant']; state.replace.mockReset(); });
  afterEach(() => { vi.useRealTimers(); });

  it('leaves completed onboarding for profile and renders it without a redirect loop', () => {
    const view = render(<StudentPortalLayout><div>Onboarding approval</div></StudentPortalLayout>);
    expect(state.replace).toHaveBeenCalledWith('/student/profile');
    state.pathname = '/student/profile';
    view.rerender(<StudentPortalLayout><div>Admission profile</div></StudentPortalLayout>);
    act(() => vi.runAllTimers());
    expect(screen.getByText('Admission profile')).toBeInTheDocument();
    expect(state.replace).toHaveBeenCalledTimes(1);
  });

  it('leaves completed Student onboarding for the existing dashboard', () => {
    state.roles = ['Student', 'Applicant'];
    render(<StudentPortalLayout><div>Onboarding approval</div></StudentPortalLayout>);
    expect(state.replace).toHaveBeenCalledWith('/student/dashboard');
  });
});
