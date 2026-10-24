import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import ExamCellLayout from '@/app/(portals)/exam-cell/layout';

const auth = vi.hoisted(() => ({
  user: { role: 'ExamCell', primaryRole: 'ExamCell', roles: ['ExamCell'] },
  isAuthenticated: true,
  isLoading: false,
}));
const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/exam-cell/schedule',
  useRouter: () => router,
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/context/ModuleRuntimeContext', () => ({
  useModuleRuntime: () => ({ manifest: null, loading: false }),
}));
vi.mock('@/lib/exam-cell/dev-context', () => ({
  ExamCellDevProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/exam-cell/ExamCellDevBanner', () => ({ ExamCellDevBanner: () => null }));
vi.mock('@/components/layout/GenericPortalShell', () => ({
  GenericPortalShell: ({ children, portal }: { children: ReactNode; portal: string }) => (
    <main data-testid="portal-shell" data-portal={portal}>{children}</main>
  ),
}));

beforeEach(() => {
  auth.user = { role: 'ExamCell', primaryRole: 'ExamCell', roles: ['ExamCell'] };
});

describe('restored Examination Cell page organization', () => {
  it('renders existing page content without injected section tabs', () => {
    render(<ExamCellLayout><h1>Master Exam Schedule</h1><form aria-label="Existing schedule form" /></ExamCellLayout>);
    expect(screen.getByTestId('portal-shell')).toHaveAttribute('data-portal', 'exam-cell');
    expect(screen.getByRole('heading', { name: 'Master Exam Schedule' })).toBeTruthy();
    expect(screen.getByRole('form', { name: 'Existing schedule form' })).toBeTruthy();
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('preserves native workflow tabs inside an existing page', () => {
    render(<ExamCellLayout><div role="tablist" aria-label="Documents"><button role="tab">Repository</button></div></ExamCellLayout>);
    expect(screen.getByRole('tablist', { name: 'Documents' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Repository' })).toBeTruthy();
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('still prevents a student from opening the staff page', () => {
    auth.user = { role: 'Student', primaryRole: 'Student', roles: ['Student'] };
    render(<ExamCellLayout><h1>Restricted schedule</h1></ExamCellLayout>);
    expect(screen.getByRole('heading', { name: '403 Forbidden' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Restricted schedule' })).toBeNull();
  });
});
