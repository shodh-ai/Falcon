/**
 * Maps backend role_name to the correct portal dashboard.
 */
export function getDashboardPathForRole(role: string | undefined | null): string {
  const r = (role ?? '').trim().toLowerCase();

  if (
    r.includes('faculty') ||
    r === 'hod' ||
    r.includes('dean') ||
    r.includes('principal') ||
    r.includes('head')
  ) {
    return '/faculty/dashboard';
  }

  if (r === 'student' || r === 'applicant') {
    return '/student/dashboard';
  }

  if (
    r === 'admin' ||
    r === 'iqac' ||
    r === 'hr' ||
    r === 'president' ||
    r === 'registrar' ||
    r === 'superadmin' ||
    r.includes('admission')
  ) {
    return '/admin/dashboard';
  }

  return '/dashboard';
}
