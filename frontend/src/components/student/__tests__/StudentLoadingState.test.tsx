import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StudentLoadingState } from '@/components/student/StudentLoadingState';

describe('StudentLoadingState', () => {
  it('shows loading label', () => {
    render(<StudentLoadingState label="Loading courses…" />);
    expect(screen.getByText('Loading courses…')).toBeTruthy();
  });
});
