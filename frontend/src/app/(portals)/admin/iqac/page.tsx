import { AdminModuleHub } from '@/components/admin/AdminModuleHub';

export default function AdminIqacPage() {
  return (
    <AdminModuleHub
      title="IQAC & Placements"
      description="Accreditation tasks, alumni verification, and placement operations have dedicated workspaces."
      links={[
        {
          href: '/iqac/dashboard',
          label: 'IQAC Dashboard',
          description: 'NAAC tasks, audits, document vault, and exports.',
          icon: 'bar-chart',
        },
        {
          href: '/placements/dashboard',
          label: 'Placements Cell',
          description: 'Drives, mock interviews, and employer relations.',
          icon: 'briefcase',
        },
        {
          href: '/alumni-admin/verifications',
          label: 'Alumni Verification',
          description: 'Conversion and alumni record approvals.',
          icon: 'bar-chart',
        },
      ]}
    />
  );
}
