import { GraduationCap } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { mockAttendance, mockFeeDues } from '@/lib/mock/student-dashboard';

export default function StudentExamsPage() {
  const blocked = mockAttendance.percentage < 75;
  const feesPending = mockFeeDues.totalPending > 0;

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h2 className="text-xl font-bold text-sgvu-navy">Exams & Hall Ticket</h2>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-sgvu-gold" />
            May 2026 End-Semester
          </CardTitle>
          <CardDescription>Download only when eligibility criteria are met</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between">
              <span>Attendance (min 75%)</span>
              {blocked ? (
                <Badge variant="destructive">{mockAttendance.percentage}%</Badge>
              ) : (
                <Badge variant="success">OK</Badge>
              )}
            </li>
            <li className="flex justify-between">
              <span>Fee clearance</span>
              {feesPending ? <Badge variant="destructive">Pending</Badge> : <Badge variant="success">Clear</Badge>}
            </li>
          </ul>
          <Button disabled={blocked || feesPending} className="w-full" size="lg">
            {blocked
              ? 'Hall ticket locked — improve attendance'
              : feesPending
                ? 'Hall ticket locked — clear fees first'
                : 'Download Hall Ticket (PDF)'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
