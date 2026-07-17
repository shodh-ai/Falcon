import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BookOpen } from 'lucide-react';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';

describe('StudentEmptyState', () => {
  it('renders title and description', () => {
    render(
      <StudentEmptyState
        icon={BookOpen}
        title="No records"
        description="Try adjusting filters"
      />,
    );
    expect(screen.getByText('No records')).toBeTruthy();
    expect(screen.getByText('Try adjusting filters')).toBeTruthy();
  });

  it('renders optional action slot', () => {
    render(
      <StudentEmptyState title="Empty" action={<button type="button">Add</button>} />,
    );
    expect(screen.getByRole('button', { name: 'Add' })).toBeTruthy();
  });
});
