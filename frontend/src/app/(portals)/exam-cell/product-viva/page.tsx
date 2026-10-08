'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { createEcellApi } from '@/lib/api/api.ecell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/lib/notifications/falcon-toast';

export default function ProductVivaPanelPage() {
  const api = useAuthedApi();
  const ecell = useMemo(() => createEcellApi(api), [api]);
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    void ecell
      .listProductVivaPanelists()
      .then(setRows)
      .catch(() => toast.error('Failed to load Product Viva panel'));
  }, [ecell]);

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-black text-sgvu-navy">Semester-End Product Viva</h1>
        <p className="text-sm text-muted-foreground">
          Panel of VC, industry, and Shodh judges — replaces standard written end-term for UROP fellows.
        </p>
      </div>
      <div className="grid gap-3">
        {rows.map((p) => (
          <Card key={p.panelist_id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {p.panelist_name} — {p.panel_role}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {p.official_email}
              {p.course_offering_id ? ` · offering ${p.course_offering_id}` : ''}
            </CardContent>
          </Card>
        ))}
        {!rows.length && (
          <p className="text-sm text-muted-foreground">
            No panelists assigned yet. Exam Cell / Dean can add VC, INDUSTRY, SHODH, or FACULTY roles via API.
          </p>
        )}
      </div>
    </div>
  );
}
