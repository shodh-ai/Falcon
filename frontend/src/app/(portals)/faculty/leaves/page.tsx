import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function FacultyLeavesPage() {
  return (
    <div className="mx-auto max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle>Apply for leave</CardTitle>
          <CardDescription>Calendar picker + medical certificate upload (sick leave) — workflow: HOD → Dean → HR</CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full touch-target" size="lg" disabled>
            Open leave form (coming soon)
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
