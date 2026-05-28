import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function FacultyIqacPage() {
  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <CardTitle>IQAC compliance tasks</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>The full task upload experience remains on the legacy dashboard while we migrate it into this shell.</p>
        <Button asChild variant="secondary" className="w-full">
          <Link href="/dashboard">Open legacy IQAC dashboard</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
