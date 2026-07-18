'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentLoadingState } from '@/components/student/StudentLoadingState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';

type TranscriptRow = {
  transcript_id: string;
  semester: number;
  status: string;
  verification_code?: string | null;
  pdf_url?: string | null;
  generated_at?: string | null;
  archived_at?: string | null;
};

export default function StudentTranscriptsPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<TranscriptRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<TranscriptRow[]>('/api/student/transcripts');
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <StudentPageShell>
      <StudentPageHeader
        title="Official Transcripts"
        description="Download archived official transcripts issued by the Examination Cell."
      />
      {loading ? (
        <StudentLoadingState label="Loading transcripts…" />
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No official transcripts have been issued yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <Card key={row.transcript_id}>
              <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
                <CardTitle className="text-base">Semester {row.semester}</CardTitle>
                <Badge variant="outline">{row.status}</Badge>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <div className="text-muted-foreground">
                  {row.verification_code ? (
                    <span>Verification code: {row.verification_code}</span>
                  ) : (
                    <span>Pending issuance</span>
                  )}
                </div>
                {row.pdf_url ? (
                  <Button variant="outline" size="sm" asChild>
                    <a href={row.pdf_url} target="_blank" rel="noopener noreferrer">
                      <Download className="mr-2 h-4 w-4" />
                      Download PDF
                    </a>
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </StudentPageShell>
  );
}
