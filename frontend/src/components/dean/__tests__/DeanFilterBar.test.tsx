import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DeanFilterBar, buildDeanFilterQuery } from '@/components/dean/DeanFilterBar';

describe('DeanFilterBar', () => {
  it('renders department filter when multiple departments', () => {
    render(
      <DeanFilterBar
        departments={[
          { dept_id: 1, dept_name: 'Mechanical' },
          { dept_id: 2, dept_name: 'Civil' },
        ]}
        value={{}}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('All departments')).toBeTruthy();
  });

  it('renders status filter when enabled', () => {
    render(
      <DeanFilterBar
        departments={[]}
        value={{}}
        onChange={() => {}}
        showStatus
      />,
    );
    expect(screen.getByText('All statuses')).toBeTruthy();
  });

  it('propagates filter changes', () => {
    const onChange = vi.fn();
    render(
      <DeanFilterBar
        departments={[{ dept_id: 1, dept_name: 'Mechanical' }]}
        value={{ date_from: '2025-01-01' }}
        onChange={onChange}
        showSemester={false}
      />,
    );
    const dateInputs = screen.getAllByDisplayValue('2025-01-01');
    fireEvent.change(dateInputs[0], { target: { value: '2025-02-01' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ date_from: '2025-02-01' }),
    );
  });
});

describe('buildDeanFilterQuery', () => {
  it('omits ALL sentinel values', () => {
    expect(
      buildDeanFilterQuery({
        dept_id: 'ALL',
        semester: 'ALL',
        status: 'ALL',
        academic_year: '2025',
      }),
    ).toBe('?academic_year=2025');
  });

  it('includes date range params', () => {
    const qs = buildDeanFilterQuery({
      date_from: '2025-01-01',
      date_to: '2025-06-30',
    });
    expect(qs).toContain('date_from=2025-01-01');
    expect(qs).toContain('date_to=2025-06-30');
  });
});
