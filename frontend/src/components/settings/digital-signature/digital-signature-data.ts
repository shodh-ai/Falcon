export type DscStatus = 'connected' | 'expiring' | 'expired' | 'not_configured';

export type SignatureActivityStatus = 'Completed' | 'Pending' | 'Failed';

export type DocumentSignType =
  | 'Degree Certificates'
  | 'Transcripts'
  | 'Appointment Letters'
  | 'Offer Letters'
  | 'Circulars'
  | 'Official Notices'
  | 'Student Bonafide Certificates';

export type DscAlert = {
  id: string;
  tone: 'amber' | 'red' | 'green' | 'blue';
  message: string;
};

export type SignatureActivity = {
  id: string;
  date: string;
  document: string;
  signedBy: string;
  action: string;
  status: SignatureActivityStatus;
};

export type DscCertificateInfo = {
  certificateName: string;
  certificateAuthority: string;
  serialNumber: string;
  expiryDate: string;
  status: DscStatus;
  owner: string;
  validFrom: string;
  issuedBy: string;
  lastUsed: string;
};

export type SecuritySnapshot = {
  lastLogin: string;
  lastSignature: string;
  deviceUsed: string;
  ipAddress: string;
  twoFactorEnabled: boolean;
};

export const DOCUMENT_SIGN_TYPES: DocumentSignType[] = [
  'Degree Certificates',
  'Transcripts',
  'Appointment Letters',
  'Offer Letters',
  'Circulars',
  'Official Notices',
  'Student Bonafide Certificates',
];

export const BATCH_OPTIONS: Record<DocumentSignType, string[]> = {
  'Degree Certificates': ['B.Tech 2026 — Batch A', 'B.Tech 2026 — Batch B', 'MBA 2026'],
  Transcripts: ['Semester VI — May 2026', 'Semester IV — Backlog'],
  'Appointment Letters': ['Faculty Appointments — Jul 2026', 'Contract Staff — Q3'],
  'Offer Letters': ['Admissions Offer — UG 2026', 'PhD Offer — Research'],
  Circulars: ['Academic Calendar 2026–27', 'Examination Guidelines'],
  'Official Notices': ['UGC Compliance Notice', 'Statutory Filing'],
  'Student Bonafide Certificates': ['Bonafide — Hostel', 'Bonafide — Visa'],
};

export const DEMO_CERTIFICATE: DscCertificateInfo = {
  certificateName: 'Registrar Office DSC — Class 3',
  certificateAuthority: 'e-Mudhra / Capricorn CA',
  serialNumber: 'A4F9-8821-B712-004C',
  expiryDate: '14 Aug 2026',
  status: 'expiring',
  owner: 'Dr. Vikram Singh — University Registrar',
  validFrom: '15 Aug 2024',
  issuedBy: 'Controller of Certifying Authorities (India)',
  lastUsed: '30 Jul 2026, 4:18 PM',
};

export const DEMO_SECURITY: SecuritySnapshot = {
  lastLogin: '01 Aug 2026, 9:42 AM',
  lastSignature: '30 Jul 2026, 4:18 PM',
  deviceUsed: 'Windows 11 · Chrome 138',
  ipAddress: '103.**.**.42 (Jaipur)',
  twoFactorEnabled: true,
};

export const DEMO_ALERTS: DscAlert[] = [
  { id: 'a1', tone: 'amber', message: 'DSC certificate expires in 15 days — renewal recommended.' },
  { id: 'a2', tone: 'blue', message: 'Signature image uploaded successfully on 28 Jul 2026.' },
  { id: 'a3', tone: 'green', message: 'Bulk signing completed — Degree Batch 2026 (142 documents).' },
];

export const DEMO_ACTIVITY: SignatureActivity[] = [
  {
    id: '1',
    date: '30 Jul 2026',
    document: 'Degree Batch 2026',
    signedBy: 'Dr. Vikram Singh',
    action: 'Bulk digital sign',
    status: 'Completed',
  },
  {
    id: '2',
    date: '28 Jul 2026',
    document: 'Appointment Letter',
    signedBy: 'Dr. Vikram Singh',
    action: 'Single document sign',
    status: 'Completed',
  },
  {
    id: '3',
    date: '25 Jul 2026',
    document: 'Official Circular',
    signedBy: 'Dr. Vikram Singh',
    action: 'Approve & sign',
    status: 'Completed',
  },
  {
    id: '4',
    date: '22 Jul 2026',
    document: 'Transcript — Semester VI',
    signedBy: 'Dr. Vikram Singh',
    action: 'Digital sign',
    status: 'Completed',
  },
  {
    id: '5',
    date: '20 Jul 2026',
    document: 'Bonafide Certificate',
    signedBy: 'Dr. Vikram Singh',
    action: 'Sign request',
    status: 'Pending',
  },
  {
    id: '6',
    date: '18 Jul 2026',
    document: 'Offer Letter — UG 2026',
    signedBy: 'Dr. Vikram Singh',
    action: 'Bulk sign',
    status: 'Failed',
  },
];

export const STATUS_META: Record<
  DscStatus,
  { label: string; dot: string; badge: string; description: string }
> = {
  connected: {
    label: 'Connected',
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-100 text-emerald-800',
    description: 'DSC token is connected and ready for signing.',
  },
  expiring: {
    label: 'Expiring Soon',
    dot: 'bg-amber-500',
    badge: 'bg-amber-100 text-amber-900',
    description: 'Certificate validity ends within 30 days.',
  },
  expired: {
    label: 'Expired',
    dot: 'bg-red-500',
    badge: 'bg-red-100 text-red-800',
    description: 'Renew certificate with IT before signing documents.',
  },
  not_configured: {
    label: 'Not Configured',
    dot: 'bg-slate-400',
    badge: 'bg-slate-100 text-slate-700',
    description: 'Contact System Admin to install and configure your DSC.',
  },
};

export const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;
export const ACCEPTED_SIGNATURE_TYPES = ['image/png', 'image/svg+xml'];
