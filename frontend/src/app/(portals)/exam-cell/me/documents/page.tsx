import { MyDocumentsPanel } from '@/components/self-service/MyDocumentsPanel';

export default function ExamCellDocumentsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-bold text-sgvu-navy">My Documents</h1>
      <MyDocumentsPanel allowDemoFallback={false} />
    </div>
  );
}
