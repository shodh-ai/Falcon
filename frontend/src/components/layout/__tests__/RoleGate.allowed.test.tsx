import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RoleGate } from '@/components/layout/RoleGate';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => '/faculty/dashboard',
  useRouter: () => ({ replace }),
}));

const mockUseAuth = vi.fn();
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

describe('RoleGate allowed access', () => {
  beforeEach(() => {
    replace.mockClear();
    mockUseAuth.mockReturnValue({
      user: { role: 'Faculty', email: 'f@test.com' },
      isAuthenticated: true,
      isLoading: false,
    });
  });

  it('renders children when role matches portal', () => {
    render(
      <RoleGate>
        <div>Faculty dashboard content</div>
      </RoleGate>,
    );
    expect(screen.getByText('Faculty dashboard content')).toBeTruthy();
  });
});
