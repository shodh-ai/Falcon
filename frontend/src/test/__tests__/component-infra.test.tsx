import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('Component test infrastructure', () => {
  it('renders with Testing Library and jsdom', () => {
    render(<div role="status">Vitest + RTL ready</div>);
    expect(screen.getByRole('status')).toHaveTextContent('Vitest + RTL ready');
  });
});
