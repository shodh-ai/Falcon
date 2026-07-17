/** Frontend portal RBAC matrix used for route guard regression tests. */
export const PORTAL_RBAC: Record<string, string[]> = {
  '/faculty': ['faculty'],
  '/hod': ['hod'],
  '/dean': ['dean'],
  '/exam-cell': ['examcell', 'superadmin', 'deputycoe', 'examadmin', 'examoperator'],
  '/super-admin': ['campusadmin', 'superadmin', 'admissionsofficer'],
};

export const CROSS_PORTAL_DENIALS: Array<{
  role: string;
  deniedPath: string;
  allowedPortal: string;
}> = [
  { role: 'faculty', deniedPath: '/hod/dashboard', allowedPortal: '/faculty' },
  { role: 'faculty', deniedPath: '/dean/dashboard', allowedPortal: '/faculty' },
  { role: 'faculty', deniedPath: '/exam-cell/dashboard', allowedPortal: '/faculty' },
  { role: 'hod', deniedPath: '/dean/dashboard', allowedPortal: '/hod' },
  { role: 'hod', deniedPath: '/super-admin/dashboard', allowedPortal: '/hod' },
  { role: 'dean', deniedPath: '/super-admin/dashboard', allowedPortal: '/dean' },
  { role: 'examoperator', deniedPath: '/faculty/dashboard', allowedPortal: '/exam-cell' },
];

export const EXAM_CELL_ACTIONS = [
  'view_dashboard',
  'manage_sessions',
  'manage_schedules',
  'generate_admit_cards',
  'manage_seating',
  'publish_results',
  'approve_ufm',
  'manage_qp',
] as const;
