import { Building2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function StudentHostelPage() {
  return (
    <div className="mx-auto max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-sgvu-gold" />
            Hostel
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Block A · Room 214</p>
          <p className="mt-2">Mess plan: Veg · Occupancy 2/3</p>
        </CardContent>
      </Card>
    </div>
  );
}
