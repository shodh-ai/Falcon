'use client';

import { useEffect, useState } from 'react';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';

type LibraryData = {
  library_cleared: boolean;
  library_dues: { fee_head: string; outstanding: string; status: string }[];
  catalog_sample: { title: string; author: string; available_copies: number }[];
};

export default function StudentLibraryPage() {
  const api = useAuthedApi();
  const [data, setData] = useState<LibraryData | null>(null);

  useEffect(() => {
    void api.get<LibraryData>('/api/student/library').then(setData);
  }, [api]);

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <StudentPageHeader
        title="Library & Dues"
        description="Active loans, outstanding library fines, and clearance status for exit no-dues."
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Exit clearance</CardTitle>
          <Badge variant={data?.library_cleared ? 'default' : 'secondary'}>
            {data?.library_cleared ? 'Library cleared' : 'Pending return / dues'}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(data?.library_dues ?? []).map((d, i) => (
            <p key={i}>
              {d.fee_head}: ₹{Number(d.outstanding).toFixed(0)} ({d.status})
            </p>
          ))}
          {!data?.library_dues?.length && <p className="text-muted-foreground">No library fee dues on file.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Catalog snapshot</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(data?.catalog_sample ?? []).slice(0, 8).map((b, i) => (
            <p key={i}>{b.title} — {b.author} ({b.available_copies} available)</p>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
