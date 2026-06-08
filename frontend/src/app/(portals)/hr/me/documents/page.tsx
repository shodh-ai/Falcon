import { MyDocumentsPanel } from '@/components/self-service/MyDocumentsPanel';

export default function HrSelfDocumentsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section>
        <h2 className="text-2xl font-bold text-sgvu-navy">My Profile & Documents</h2>
        <p className="text-sm text-muted-foreground">Personal document vault and KYC uploads.</p>
      </section>
      <MyDocumentsPanel />
    </div>
  );
}
