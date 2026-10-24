import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FacultyWeeklyTestsPage from '@/app/(portals)/faculty/weekly-tests/page';

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() } }));
vi.mock('next/navigation', () => ({ usePathname: () => '/faculty/weekly-tests' }));
vi.mock('@/lib/api', () => ({ useAuthedApi: () => api }));
vi.mock('@/components/faculty/useFacultyCourses', () => ({ useFacultyCourses: () => ({ courses: [], loading: false }) }));
vi.mock('@/lib/faculty-demo-mode', () => ({
  isEmptyArray: (rows: unknown[]) => rows.length === 0,
  isFacultyDemoEntityId: () => false,
  isFacultyDemoSmokeId: () => false,
  withFacultyDemoFallback: (rows: unknown) => rows,
}));
vi.mock('@/components/faculty', () => ({
  FacultyPageShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FacultyPanel: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  FacultyPageHeader: () => null,
}));

beforeEach(() => { vi.clearAllMocks(); api.get.mockResolvedValue([]); });
afterEach(cleanup);

describe('faculty weekly test configuration', () => {
  it('lets faculty choose question count and maximum marks instead of a fixed ten-question key', async () => {
    render(<FacultyWeeklyTestsPage />);
    await screen.findByText("You haven't scheduled any tests yet.");
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Number of Questions' }), { target: { value: '4' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Maximum Marks' }), { target: { value: '20' } });
    expect(screen.getByRole('spinbutton', { name: 'Number of Questions' })).toHaveValue(4);
    expect(screen.getByRole('spinbutton', { name: 'Maximum Marks' })).toHaveValue(20);
    expect(screen.getByRole('button', { name: /Upload Answer Key.*0\/4/ })).toBeInTheDocument();
  });
});
