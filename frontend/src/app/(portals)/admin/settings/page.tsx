import { AdminModuleHub } from '@/components/admin/AdminModuleHub';

export default function AdminSettingsPage() {
  return (
    <AdminModuleHub
      title="Settings & IT"
      description="System configuration, integrations, and account settings."
      links={[
        {
          href: '/admin/account/settings',
          label: 'Account Settings',
          description: 'Profile, password, and notification preferences.',
          icon: 'settings',
        },
        {
          href: '/super-admin/dashboard',
          label: 'Super Admin Console',
          description: 'Tenant configuration (Campus Admin / Super Admin only).',
          icon: 'shield',
        },
        {
          href: '/documents',
          label: 'Document Center',
          description: 'Institutional document exports and uploads.',
          icon: 'plug',
        },
      ]}
    />
  );
}
