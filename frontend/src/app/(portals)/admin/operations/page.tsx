import { AdminModuleHub } from '@/components/admin/AdminModuleHub';

export default function AdminOperationsPage() {
  return (
    <AdminModuleHub
      title="Campus Operations"
      description="Hostel, transport, timetable, and convocation workflows are in Admin Ops."
      links={[
        {
          href: '/admin-ops/dashboard',
          label: 'Admin Ops Dashboard',
          description: 'Assets, fleet, venues, and campus calendar.',
          icon: 'bus',
        },
        {
          href: '/admin-ops/timetable',
          label: 'Master Timetable',
          description: 'University-wide timetable view.',
          icon: 'calendar-clock',
        },
        {
          href: '/admin-ops/convocation',
          label: 'Convocation & Certificates',
          description: 'Degree verification and certificate batches.',
          icon: 'graduation-cap',
        },
      ]}
    />
  );
}
