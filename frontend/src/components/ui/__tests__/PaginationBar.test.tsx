import { PaginationBar } from '@/components/ui/PaginationBar';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

describe('PaginationBar component', () => {
  it('renders range and navigation controls', () => {
    render(
      <PaginationBar total={100} limit={20} offset={20} onPageChange={() => {}} />,
    );
    expect(screen.getByText(/Showing 21–40 of 100/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Next/i })).toBeTruthy();
  });

  it('handles zero total and page navigation', () => {
    const onPageChange = vi.fn();
    render(
      <PaginationBar total={0} limit={20} offset={0} onPageChange={onPageChange} />,
    );
    expect(screen.getByText(/Showing 0–0 of 0/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Previous/i })).toHaveProperty('disabled', true);
    screen.getByRole('button', { name: /Next/i }).click();
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('invokes onPageChange for previous and next', () => {
    const onPageChange = vi.fn();
    render(
      <PaginationBar total={100} limit={20} offset={20} onPageChange={onPageChange} />,
    );
    screen.getByRole('button', { name: /Previous/i }).click();
    expect(onPageChange).toHaveBeenCalledWith(0);
    screen.getByRole('button', { name: /Next/i }).click();
    expect(onPageChange).toHaveBeenCalledWith(40);
  });
});
