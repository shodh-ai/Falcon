import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AttendanceWindow } from '@/components/faculty/AttendanceWindow';

describe('attendance window', () => {
  afterEach(() => vi.useRealTimers());
  it('expires the current window and labels campus time', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-31T10:00:00Z'));
    const onExpired = vi.fn();
    render(<AttendanceWindow deadline="2026-10-31T10:01:00Z" reopened onExpired={onExpired} />);
    expect(screen.getByText(/HOD-approved correction window/)).toHaveTextContent('0h 1m remaining');
    expect(screen.getByText(/IST/)).toBeInTheDocument();
    expect(onExpired).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(60000));
    expect(onExpired).toHaveBeenCalled();
  });
  it('does not invent a deadline when the server has not supplied one', () => {
    const { container } = render(<AttendanceWindow deadline={null} reopened={false} onExpired={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
