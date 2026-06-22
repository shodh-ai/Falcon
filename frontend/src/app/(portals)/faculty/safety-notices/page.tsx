'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import { concernStatusLabel, concernTypeLabel } from '@/lib/student-safety';

type Notice = {
  concern_id: string;
  concern_type: string;
  status: string;
  accused_notified_at: string | null;
  created_at: string;
};

export default function FacultySafetyNoticesPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api
      .get<Notice[]>('/api/student-safety/faculty/notices')
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [api]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold text-sgvu-navy">Safety Notices</h1>
        <p className="text-sm text-muted-foreground">
          Official notices when a student safety concern involving you is under review.
          Do not contact any student about these matters. Await committee communication.
        </p>
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </p>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">No notices.</CardContent>
        </Card>
      ) : (
        rows.map((row) => (
          <Card key={row.concern_id}>
            <CardHeader className="flex flex-row items-start justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                {concernTypeLabel(row.concern_type)}
              </CardTitle>
              <Badge>{concernStatusLabel(row.status as never)}</Badge>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p>
                A confidential concern is under review. You were notified on{' '}
                {row.accused_notified_at
                  ? new Date(row.accused_notified_at).toLocaleString('en-IN')
                  : new Date(row.created_at).toLocaleString('en-IN')}
                .
              </p>
              <p className="mt-2">
                The Disciplinary Committee / ICC will contact you through official channels if your
                statement is required.
              </p>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
