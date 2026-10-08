import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PublishConfirmDialog } from '@/components/exam-cell/PublishConfirmDialog';

describe('PublishConfirmDialog', () => {
  it('disables confirm until PUBLISH typed', () => {
    const onConfirm = vi.fn();
    render(
      <PublishConfirmDialog
        open
        onOpenChange={() => {}}
        confirmText=""
        onConfirmTextChange={() => {}}
        onConfirm={onConfirm}
        courseLabel="ME-301 results"
      />,
    );
    const confirmBtn = screen.getByRole('button', { name: /Push to Student Portals/i });
    expect(confirmBtn.hasAttribute('disabled') || (confirmBtn as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('enables confirm when text matches PUBLISH', () => {
    const onConfirm = vi.fn();
    render(
      <PublishConfirmDialog
        open
        onOpenChange={() => {}}
        confirmText="PUBLISH"
        onConfirmTextChange={() => {}}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Push to Student Portals/i }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('calls onOpenChange when cancel clicked', () => {
    const onOpenChange = vi.fn();
    render(
      <PublishConfirmDialog
        open
        onOpenChange={onOpenChange}
        confirmText=""
        onConfirmTextChange={() => {}}
        onConfirm={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
