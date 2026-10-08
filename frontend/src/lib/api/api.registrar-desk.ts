/** Registrar Desk API paths (Nest: /api/admin/registrar-desk) */
export const REGISTRAR_DESK = {
  placementStudents: '/api/admin/registrar-desk/placement/students',
  placementAssign: '/api/admin/registrar-desk/placement/assign',
  placementBulk: '/api/admin/registrar-desk/placement/bulk',
  placementHistory: '/api/admin/registrar-desk/placement/history',
  lifecycle: (studentUserId: string) =>
    `/api/admin/registrar-desk/lifecycle/${studentUserId}`,
  lifecycleHistory: (studentUserId: string) =>
    `/api/admin/registrar-desk/lifecycle/${studentUserId}/history`,
  registrations: '/api/admin/registrar-desk/registrations',
  registrationReview: (id: string) =>
    `/api/admin/registrar-desk/registrations/${id}/review`,
  certificates: '/api/admin/registrar-desk/certificates',
  certificateAction: (id: string, action: string) =>
    `/api/admin/registrar-desk/certificates/${id}/${action}`,
  certificatePdf: (id: string) =>
    `/api/admin/registrar-desk/certificates/${id}/pdf`,
  reportsSummary: '/api/admin/registrar-desk/reports/summary',
  reportsExport: (format: 'csv' | 'pdf' = 'csv') =>
    `/api/admin/registrar-desk/reports/export?format=${format}`,
  activity: '/api/admin/registrar-desk/activity',
  legalRti: '/api/admin/registrar-desk/legal/rti',
  legalCourt: '/api/admin/registrar-desk/legal/court',
  legalNotices: '/api/admin/registrar-desk/legal/notices',
  legalDisciplinary: '/api/admin/registrar-desk/legal/disciplinary',
  legalCompliance: '/api/admin/registrar-desk/legal/compliance',
  appointments: '/api/admin/registrar-desk/appointments',
  appointmentAction: (id: string, action: string) =>
    `/api/admin/registrar-desk/appointments/${id}/${action}`,
  appointmentPdf: (id: string) =>
    `/api/admin/registrar-desk/appointments/${id}/pdf`,
  appointmentActivity: '/api/admin/registrar-desk/appointments/activity',
  studentRecord: (userId: string) =>
    `/api/admin/registrar-desk/students/${userId}`,
  studentDocuments: (userId: string) =>
    `/api/admin/registrar-desk/students/${userId}/documents`,
  governance: '/api/admin/registrar-desk/governance',
  governanceDecide: (id: string) =>
    `/api/admin/registrar-desk/governance/${id}/decide`,
  dsc: '/api/admin/registrar-desk/dsc',
  dscSignature: '/api/admin/registrar-desk/dsc/signature',
  dscConfigure: '/api/admin/registrar-desk/dsc/configure',
  dscRenew: '/api/admin/registrar-desk/dsc/renew',
  dscBulkSign: '/api/admin/registrar-desk/dsc/bulk-sign',
  dscSignQueue: '/api/admin/registrar-desk/dsc/sign-queue',
  enrollmentQueue: '/api/admin/registrar-desk/enrollment/queue',
  enrollmentRules: '/api/admin/registrar-desk/enrollment/rules',
  enrollmentEnroll: '/api/admin/registrar-desk/enrollment/enroll',
  enrollmentHistory: '/api/admin/registrar-desk/enrollment/history',
  petitions: '/api/admin/registrar-desk/petitions',
  petitionDecide: (id: string) =>
    `/api/admin/registrar-desk/petitions/${id}/decide`,
  dashboardKpis: '/api/admin/registrar-desk/dashboard/kpis',
  degreeEligibility: '/api/admin/registrar-desk/degree-eligibility',
  degreeEligibilityDecide: (id: string) =>
    `/api/admin/registrar-desk/degree-eligibility/${id}/decide`,
  degreeEligibilityHistory: (id: string) =>
    `/api/admin/registrar-desk/degree-eligibility/${id}/history`,
  workflow: (studentUserId: string) =>
    `/api/admin/registrar-desk/workflow/${studentUserId}`,
} as const;
