import { AdminModuleHub } from '@/components/admin/AdminModuleHub';

export default function AdminHrPage() {
  return (
    <AdminModuleHub
      title="HR & Payroll"
      description="Leave workflows, payroll summaries, and org structure are managed in the HR workspace."
      links={[
        {
          href: '/hr/dashboard',
          label: 'HR Dashboard',
          description: 'Headcount, leave queues, and payroll snapshots.',
          icon: 'users',
        },
        {
          href: '/hr/admin/workflows',
          label: 'HR Admin Workflows',
          description: 'Policies, delegation, and approval chains.',
          icon: 'clipboard-list',
        },
        {
          href: '/admin/staff-appointments',
          label: 'Staff Appointment & Verification',
          description: 'Review appointments, verify documents, and issue signed letters.',
          icon: 'users',
        },
      ]}
    />
  );
}
