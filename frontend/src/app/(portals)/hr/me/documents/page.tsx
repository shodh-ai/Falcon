import { MyDocumentsPanel } from '@/components/self-service/MyDocumentsPanel';
import { Card, CardContent } from '@/components/ui/card';

export default function HrSelfDocumentsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Card>
        <CardContent className="p-6">
          <section>
            <h2 className="text-2xl font-bold text-sgvu-navy">My Profile & Documents</h2>
            <p className="mt-1 text-sm text-muted-foreground">Upload, view, and track verification of your personal and KYC documents.</p>
          </section>
        </CardContent>
      </Card>
      <MyDocumentsPanel />
    </div>
  );
}
