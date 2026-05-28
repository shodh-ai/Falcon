import { GatePassDialog } from '@/components/student/GatePassDialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function StudentGatePassPage() {
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h2 className="text-xl font-bold text-sgvu-navy">Hostel Gate Pass</h2>
      <Card>
        <CardHeader>
          <CardTitle>Request exit pass</CardTitle>
          <CardDescription>Warden approval generates a QR code on your phone for security.</CardDescription>
        </CardHeader>
        <CardContent>
          <GatePassDialog />
        </CardContent>
      </Card>
    </div>
  );
}
