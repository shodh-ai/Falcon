/**
 * Maps backend role_name to the correct portal dashboard.
 */
export function getDashboardPathForRole(role: string | undefined | null): string {
  const r = (role ?? '').trim().toLowerCase();

  if (r === 'faculty' || r === 'hod' || r === 'dean') {
    return '/faculty/dashboard';
  }

  if (r === 'student' || r === 'applicant') {
    return '/student/dashboard';
  }

  if (
    r === 'iqac' ||
    r === 'hr' ||
    r === 'president' ||
    r === 'registrar' ||
    r === 'superadmin' ||
    r === 'accountant' ||
    r === 'warden' ||
    r === 'librarian' ||
    r === 'placementcell' ||
    r === 'transportofficer' ||
    r.includes('admission')
  ) {
    return '/admin/dashboard';
  }

  return '/dashboard';
}
