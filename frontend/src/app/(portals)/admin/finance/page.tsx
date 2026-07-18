import { AdminModuleHub } from '@/components/admin/AdminModuleHub';

export default function AdminFinancePage() {
  return (
    <AdminModuleHub
      title="Finance"
      description="Fee demands, defaulters, and ledger exports live in the Finance workspace."
      links={[
        {
          href: '/finance/dashboard',
          label: 'Finance Dashboard',
          description: 'Collections, demands, and payment status.',
          icon: 'wallet',
        },
        {
          href: '/reports',
          label: 'Export Reports',
          description: 'Warehouse datasets and CSV exports for finance teams.',
          icon: 'file-text',
        },
      ]}
    />
  );
}
