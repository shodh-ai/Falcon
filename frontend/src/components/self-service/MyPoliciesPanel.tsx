'use client';

import { useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { ThumbsUp, ThumbsDown, CheckCircle2, FileText } from 'lucide-react';
import { FacultyEmptyState, FacultyPanel } from '@/components/faculty';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';

type Policy = {
  policy_id: string;
  title: string;
  category: string;
  file_url: string | null;
  is_mandatory: boolean;
  acknowledged: boolean;
  user_vote: 'YES' | 'NO' | null;
};

export function MyPoliciesPanel() {
  const api = useAuthedApi();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api
      .get<Policy[]>('/api/hr/ess/policies')
      .then(setPolicies)
      .catch((err) => {
        setPolicies([]);
        toast.error(err instanceof Error ? err.message : 'Failed to load policies');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [api]);

  async function acknowledge(id: string) {
    try {
      await api.post(`/api/hr/ess/policies/${id}/acknowledge`, {});
      toast.success('Policy acknowledged');
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to acknowledge');
    }
  }

  async function castVote(id: string, vote: 'YES' | 'NO') {
    try {
      await api.post(`/api/hr/ess/policies/${id}/vote`, { vote });
      toast.success('Vote submitted');
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit vote');
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading policies…</p>;
  }

  if (policies.length === 0) {
    return (
      <FacultyEmptyState
        title="No active policies"
        description="When HR publishes company policies, they will appear here for acknowledgement."
      />
    );
  }

  return (
    <FacultyPanel title="Active policies" count={policies.length}>
      <div className="space-y-3">
        {policies.map((p) => (
          <div
            key={p.policy_id}
            className="rounded-xl border border-border/60 bg-background p-4 shadow-sm"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-3 min-w-0">
                <FileText className="mt-0.5 h-5 w-5 shrink-0 text-sgvu-gold" />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-sgvu-navy">{p.title}</p>
                    {p.is_mandatory && (
                      <span className="rounded bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-600">
                        Mandatory
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{p.category}</p>
                  {p.file_url && (
                    <a
                      href={p.file_url}
                      className="mt-1 text-sm font-medium text-sgvu-navy underline hover:text-sgvu-gold"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View PDF
                    </a>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant={p.user_vote === 'YES' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => castVote(p.policy_id, 'YES')}
                >
                  <ThumbsUp className="mr-1 h-4 w-4" />
                  In favour
                </Button>
                <Button
                  variant={p.user_vote === 'NO' ? 'destructive' : 'outline'}
                  size="sm"
                  onClick={() => castVote(p.policy_id, 'NO')}
                >
                  <ThumbsDown className="mr-1 h-4 w-4" />
                  Against
                </Button>
                {p.acknowledged ? (
                  <span className="flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" />
                    Acknowledged
                  </span>
                ) : (
                  <Button size="sm" onClick={() => acknowledge(p.policy_id)}>Acknowledge</Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </FacultyPanel>
  );
}
