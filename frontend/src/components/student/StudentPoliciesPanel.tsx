'use client';

import { useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { ThumbsUp, ThumbsDown, CheckCircle2, FileText, Shield } from 'lucide-react';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';
import { StudentSectionCard } from '@/components/student/StudentSectionCard';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';

type Policy = {
  policy_id: string;
  title: string;
  category: string;
  file_url: string | null;
  is_mandatory: boolean;
  is_voting_enabled: boolean;
  acknowledged: boolean;
  user_vote: 'YES' | 'NO' | null;
};

export function StudentPoliciesPanel() {
  const api = useAuthedApi();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api
      .get<Policy[]>('/api/student/policies')
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

  async function acknowledge(id: string, vote?: 'YES' | 'NO') {
    try {
      await api.post(`/api/student/policies/${id}/acknowledge`, { vote });
      toast.success(vote ? 'Vote submitted' : 'Policy acknowledged');
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to process request');
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground p-4">Loading policies…</p>;
  }

  if (policies.length === 0) {
    return (
      <StudentEmptyState
        title="No active policies"
        description="When University authorities publish mandatory policies or rules, they will appear here for acknowledgement."
      />
    );
  }

  return (
    <StudentSectionCard title="Active University Policies" icon={Shield}>
      <div className="space-y-3">
        {policies.map((p) => (
          <div
            key={p.policy_id}
            className="rounded-xl border border-border/60 bg-background p-4 shadow-sm transition-all hover:border-sgvu-gold/40"
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
                  <p className="text-sm text-muted-foreground">Issued by: {p.category}</p>
                  {p.file_url && (
                    <a
                      href={p.file_url}
                      className="mt-1 text-sm font-medium text-sgvu-navy underline hover:text-sgvu-gold inline-block"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View PDF Document
                    </a>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {p.is_voting_enabled && (
                  <>
                    <Button
                      variant={p.user_vote === 'YES' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => acknowledge(p.policy_id, 'YES')}
                    >
                      <ThumbsUp className="mr-1 h-4 w-4" />
                      In favour
                    </Button>
                    <Button
                      variant={p.user_vote === 'NO' ? 'destructive' : 'outline'}
                      size="sm"
                      onClick={() => acknowledge(p.policy_id, 'NO')}
                    >
                      <ThumbsDown className="mr-1 h-4 w-4" />
                      Against
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </StudentSectionCard>
  );
}
