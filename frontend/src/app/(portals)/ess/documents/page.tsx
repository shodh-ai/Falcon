'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useHrApi } from '@/lib/api/use-hr-api';

type Doc = {
  document_id: string;
  document_type: string;
  file_url: string;
  verification_status: string;
  uploaded_at: string;
};

export default function EssDocumentsPage() {
  const api = useHrApi();
  const [docs, setDocs] = useState<Doc[]>([]);

  useEffect(() => {
    void api.get<Doc[]>('/api/hr/ess/documents').then(setDocs);
  }, [api]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <section>
        <h2 className="text-2xl font-bold text-sgvu-navy">Document Vault</h2>
        <p className="text-sm text-muted-foreground">Salary slips, appraisal letters, Form 16s, and onboarding kit.</p>
      </section>

      <div className="space-y-3">
        {docs.map((d) => (
          <Card key={d.document_id}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">{d.document_type}</CardTitle>
              <span className="text-xs text-muted-foreground">{d.verification_status}</span>
            </CardHeader>
            <CardContent className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {new Date(d.uploaded_at).toLocaleDateString()}
              </span>
              {d.file_url && (
                <Button size="sm" variant="outline" asChild>
                  <a href={d.file_url} target="_blank" rel="noopener noreferrer">
                    <Download className="mr-1 h-4 w-4" /> Download
                  </a>
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
        {!docs.length && <p className="text-sm text-muted-foreground">No documents published yet.</p>}
      </div>
    </div>
  );
}
