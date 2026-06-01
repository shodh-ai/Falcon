/**
 * Maps backend role_name to the correct portal dashboard.
 */
export function getDashboardPathForRole(role: string | undefined | null): string {
  const r = (role ?? '').trim().toLowerCase();

  if (r === 'faculty') {
    return '/faculty/dashboard';
  }

  if (r === 'hod' || r === 'dean') {
    return '/hod/dashboard';
  }

  if (r === 'student' || r === 'applicant') {
    return '/student/dashboard';
  }

  if (r === 'hr') {
    return '/hr/dashboard';
  }

  if (r === 'warden') {
    return '/hostel-admin/dashboard';
  }

  if (r === 'accountant') {
    return '/finance/dashboard';
  }

  if (r === 'iqac') {
    return '/iqac/dashboard';
  }

  if (r === 'librarian') {
    return '/library/dashboard';
  }

  if (r === 'president') {
    return '/president/executive-summary';
  }

  if (r === 'parent') {
    return '/parent/dashboard';
  }

  if (r === 'alumni') {
    return '/alumni/dashboard';
  }

  if (r === 'examcell' || r === 'exam cell') {
    return '/exam-cell/dashboard';
  }

  if (
    r === 'registrar' ||
    r === 'superadmin' ||
    r === 'placementcell' ||
    r === 'transportofficer' ||
    r.includes('admission')
  ) {
    return '/admin/dashboard';
  }
  return '/dashboard';
}

export function getWorkspaceLabelForRole(role: string): string {
  const r = role.trim().toLowerCase();
  if (r === 'student' || r === 'applicant') return 'Student Workspace';
  if (r === 'faculty') return 'Faculty Workspace';
  if (r === 'hod' || r === 'dean') return 'HOD Workspace';
  if (r === 'hr') return 'HR Workspace';
  if (r === 'warden') return 'Hostel Workspace';
  if (r === 'accountant') return 'Finance Workspace';
  if (r === 'iqac') return 'IQAC Workspace';
  if (r === 'librarian') return 'Library Workspace';
  if (r === 'president') return 'Executive Workspace';
  if (r === 'parent') return 'Parent Workspace';
  if (r === 'alumni') return 'Alumni Network';
  if (r === 'examcell' || r === 'exam cell') return 'Exam Cell Workspace';
  return `${role} Workspace`;
}

/** Compact label for header controls where space is limited */
export function getWorkspaceShortLabelForRole(role: string): string {
  const r = role.trim().toLowerCase();
  if (r === 'student' || r === 'applicant') return 'Student';
  if (r === 'faculty') return 'Faculty';
  if (r === 'hod' || r === 'dean') return 'HOD';
  if (r === 'hr') return 'HR';
  if (r === 'warden') return 'Hostel';
  if (r === 'accountant') return 'Finance';
  if (r === 'iqac') return 'IQAC';
  if (r === 'librarian') return 'Library';
  if (r === 'president') return 'Executive';
  if (r === 'parent') return 'Parent';
  if (r === 'alumni') return 'Alumni';
  if (r === 'examcell' || r === 'exam cell') return 'Exam Cell';
  return role;
}

const portalRoles: Record<string, string[]> = {
  '/student': ['student', 'applicant'],
  '/faculty': ['faculty'],
  '/hod': ['hod', 'dean'],
  '/hr': ['hr', 'superadmin'],
  '/hostel-admin': ['warden', 'superadmin'],
  '/finance': ['accountant', 'superadmin'],
  '/iqac': ['iqac', 'superadmin', 'registrar', 'president'],
  '/library': ['librarian', 'superadmin'],
  '/president': ['president', 'superadmin'],
  '/parent': ['parent', 'superadmin'],
  '/exam-cell': ['examcell', 'superadmin'],
  '/alumni': ['alumni'],
  '/alumni-admin': ['iqac', 'superadmin', 'registrar', 'president'],
  '/admin': ['superadmin', 'registrar'],
};

export function canRoleAccessPath(
  roleOrRoles: string | string[] | undefined | null,
  pathname: string,
): boolean {
  const roles = (Array.isArray(roleOrRoles) ? roleOrRoles : [roleOrRoles])
    .filter((role): role is string => Boolean(role))
    .map((role) => role.trim().toLowerCase());
  const portal = Object.keys(portalRoles)
    .sort((a, b) => b.length - a.length)
    .find((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  if (!portal) return true;
  return roles.some((role) => portalRoles[portal].includes(role));
}
