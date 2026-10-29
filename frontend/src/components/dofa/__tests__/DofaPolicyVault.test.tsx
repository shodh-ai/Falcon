import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DofaPolicyVault } from '../DofaPolicyVault';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  user: { role: 'Accountant' as string },
}));

vi.mock('@/lib/api', () => ({ useAuthedApi: () => mocks }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('@/lib/notifications/falcon-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Background: () => null,
  Controls: () => null,
  MiniMap: () => null,
  addEdge: vi.fn(),
  useEdgesState: (initial: unknown[]) => [initial, vi.fn(), vi.fn()],
  useNodesState: (initial: unknown[]) => [initial, vi.fn(), vi.fn()],
  Handle: () => null,
  Position: { Top: 'top' },
}));

describe('DofaPolicyVault access states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.role = 'Accountant';
  });

  it('explains denied access to roles that are not in the backend read allowlist', () => {
    render(<DofaPolicyVault />);

    expect(screen.getByRole('alert')).toHaveTextContent('Policy Vault access required');
    expect(screen.getByText(/CFO.*Chairman.*President.*InternalAuditor/)).toBeInTheDocument();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('distinguishes a graph service failure from an unconfigured workflow', async () => {
    mocks.user.role = 'CFO';
    mocks.get.mockRejectedValueOnce(new Error('Forbidden resource'));

    render(<DofaPolicyVault />);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Could not load the policy graph'));
    expect(screen.queryByText(/No policy graph is configured/)).not.toBeInTheDocument();
  });
});
