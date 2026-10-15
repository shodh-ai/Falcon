import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StaffProfileVerificationsPage from '@/app/(portals)/hr/staff-profile-verifications/page';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  user: { role: 'HRAdmin', roles: [] as string[] },
}));

vi.mock('@/lib/api', () => ({ useAuthedApi: () => mocks }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: mocks.user }) }));

describe('Staff profile verification permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.role = 'HRAdmin';
    mocks.get.mockResolvedValue([]);
  });

  it('shows the one-time Pharmacy recheck controls to HR Admin', async () => {
    render(<StaffProfileVerificationsPage />);
    expect(screen.getByText('One-time Pharmacy HR recheck')).toBeInTheDocument();
    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith(
      '/api/hr/staff-profile-reviews/pharmacy/departments',
    ));
  });

  it.each(['HR', 'SuperAdmin', 'CampusAdmin'])(
    'does not offer recheck controls to %s', async (role) => {
      mocks.user.role = role;
      render(<StaffProfileVerificationsPage />);
      expect(screen.queryByText('One-time Pharmacy HR recheck')).not.toBeInTheDocument();
      await waitFor(() => expect(mocks.get).toHaveBeenCalledWith('/api/hr/staff-profile-reviews'));
      expect(mocks.get).not.toHaveBeenCalledWith(
        '/api/hr/staff-profile-reviews/pharmacy/departments',
      );
    },
  );
});
