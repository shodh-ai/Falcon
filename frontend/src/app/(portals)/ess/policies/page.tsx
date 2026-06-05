'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useHrApi } from '@/lib/api/use-hr-api';

type Policy = {
  policy_id: string;
  title: string;
  category: string;
  file_url: string | null;
  acknowledged: boolean;
};

export default function EssPoliciesPage() {
  const api = useHrApi();
  const [policies, setPolicies] = useState<Policy[]>([]);

  useEffect(() => {
    void api.get<Policy[]>('/api/hr/ess/policies').then(setPolicies);
  }, [api]);

  async function acknowledge(policyId: string) {
    try {
      await api.post(`/api/hr/ess/policies/${policyId}/acknowledge`, {});
      toast.success('Policy acknowledged');
      setPolicies(await api.get<Policy[]>('/api/hr/ess/policies'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <section>
        <h2 className="text-2xl font-bold text-sgvu-navy">Company Policies</h2>
        <p className="text-sm text-muted-foreground">Read and acknowledge mandatory policies for compliance.</p>
      </section>

      {policies.map((p) => (
        <Card key={p.policy_id}>
          <CardHeader>
            <CardTitle className="text-base">{p.title}</CardTitle>
            <p className="text-xs text-muted-foreground">{p.category}</p>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            {p.file_url && (
              <Button size="sm" variant="outline" asChild>
                <a href={p.file_url} target="_blank" rel="noopener noreferrer">
                  View PDF
                </a>
              </Button>
            )}
            {p.acknowledged ? (
              <span className="text-sm text-green-700">Acknowledged</span>
            ) : (
              <Button size="sm" onClick={() => void acknowledge(p.policy_id)}>
                I acknowledge
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
