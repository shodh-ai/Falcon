import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RoleGate } from '@/components/layout/RoleGate';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => '/hod/dashboard',
  useRouter: () => ({ replace }),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: { role: 'Faculty', email: 'faculty@test.com' },
    isAuthenticated: true,
    isLoading: false,
  }),
}));

describe('RoleGate — protected routes', () => {
  beforeEach(() => {
    replace.mockClear();
  });

  it('shows 403 when faculty accesses HOD route', () => {
    render(
      <RoleGate>
        <div>HOD Content</div>
      </RoleGate>,
    );
    expect(screen.getByText(/403 Forbidden/i)).toBeTruthy();
    expect(screen.queryByText('HOD Content')).toBeNull();
  });
});
