import { FeatureMatrixDashboard } from '@/components/portal/FeatureMatrixDashboard';

export default function HostelAdminDashboardPage() {
  return (
    <FeatureMatrixDashboard
      title="Hostel Admin Dashboard"
      subtitle="Residential administration for allocations, gate passes, and campus movement logs."
      features={[
        { title: 'Allocations', items: ['Map students to blocks', 'Assign rooms and beds', 'Maintain mess plan'] },
        { title: 'Gate Pass Desk', items: ['Live student gate pass queue', 'Approve or reject requests', 'Track return windows'] },
        { title: 'Logs', items: ['Live out-of-campus list', 'Return status tracking', 'Warden audit trail'] },
      ]}
    />
  );
}
