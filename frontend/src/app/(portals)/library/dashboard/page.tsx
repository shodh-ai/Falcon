import { FeatureMatrixDashboard } from '@/components/portal/FeatureMatrixDashboard';

export default function LibraryDashboardPage() {
  return (
    <FeatureMatrixDashboard
      title="Library Dashboard"
      subtitle="Catalog, circulation, and overdue fine workflows synced to Finance."
      features={[
        { title: 'Catalog', items: ['Search books', 'Add books', 'Maintain inventory'] },
        { title: 'Circulation', items: ['Issue books to students', 'Issue books to faculty', 'Return processing'] },
        { title: 'Overdue Fines', items: ['Overdue calculation', 'Fine generation', 'Finance sync'] },
      ]}
    />
  );
}
