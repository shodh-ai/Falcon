import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RoleGate } from '@/components/layout/RoleGate';

const replace = vi.fn();
const useAuthMock = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => '/hod/dashboard',
  useRouter: () => ({ replace }),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

describe('RoleGate auth states', () => {
  beforeEach(() => {
    replace.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows loader while auth is loading', () => {
    useAuthMock.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: true,
    });
    render(
      <RoleGate>
        <div>Protected</div>
      </RoleGate>,
    );
    expect(screen.getByText(/Switching Falcon workspace/i)).toBeTruthy();
  });

  it('shows loader when unauthenticated', () => {
    useAuthMock.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });
    render(
      <RoleGate>
        <div>Protected</div>
      </RoleGate>,
    );
    expect(screen.getByText(/Switching Falcon workspace/i)).toBeTruthy();
    vi.runAllTimers();
    expect(replace).toHaveBeenCalledWith('/');
  });
});
