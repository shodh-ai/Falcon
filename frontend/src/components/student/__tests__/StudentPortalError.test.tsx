import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import StudentPortalError from '@/app/(portals)/student/error';

const auth = vi.hoisted(() => ({ roles: ['Student'] }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: auth }) }));

describe('Student route error boundary', () => {
  it('recovers using the Next.js retry callback without exposing error details', () => {
    auth.roles = ['Student'];
    const retry = vi.fn();
    render(<StudentPortalError error={new Error('Private record detail')} retry={retry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('This page could not be displayed');
    expect(screen.queryByText('Private record detail')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Portal home' })).toHaveAttribute('href', '/student/dashboard');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('takes Applicants to an allowed home route', () => {
    auth.roles = ['Applicant'];
    render(<StudentPortalError error={new Error('Failed')} retry={vi.fn()} />);
    expect(screen.getByRole('link', { name: 'Portal home' })).toHaveAttribute('href', '/student/profile');
  });
});
