'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';
import { ThumbsUp, ThumbsDown, CheckCircle2 } from 'lucide-react';

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

  const load = () => {
    api.get<Policy[]>('/api/hr/ess/policies').then(setPolicies);
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
      toast.success('Vote submitted successfully!');
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit vote');
    }
  }

  return (
    <div className="space-y-4">
      {policies.length === 0 && (
        <div className="text-center py-10 text-slate-500 text-sm">
          No active policies available right now.
        </div>
      )}
      {policies.map((p) => (
        <Card key={p.policy_id} className="group overflow-hidden border border-slate-200">
          <CardContent className="p-0">
            <div className="flex flex-col md:flex-row items-center justify-between p-5 gap-4">
              <div className="flex-1 w-full">
                <div className="flex items-center gap-3">
                  <p className="font-semibold text-slate-800 text-lg">{p.title}</p>
                  {p.is_mandatory && <span className="bg-red-50 text-red-600 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider">Mandatory</span>}
                </div>
                <p className="text-muted-foreground text-sm mt-1">{p.category}</p>
              </div>
              
              <div className="flex items-center gap-4 w-full md:w-auto shrink-0 bg-slate-50 p-2 rounded-lg border border-slate-100">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mr-2">Your Vote</p>
                <Button
                  variant={p.user_vote === 'YES' ? 'default' : 'outline'}
                  size="sm"
                  className={p.user_vote === 'YES' ? 'bg-green-600 hover:bg-green-700 text-white' : 'text-slate-600 hover:text-green-600 hover:bg-green-50'}
                  onClick={() => castVote(p.policy_id, 'YES')}
                >
                  <ThumbsUp className="h-4 w-4 mr-2" />
                  In Favour
                </Button>
                <Button
                  variant={p.user_vote === 'NO' ? 'default' : 'outline'}
                  size="sm"
                  className={p.user_vote === 'NO' ? 'bg-red-600 hover:bg-red-700 text-white' : 'text-slate-600 hover:text-red-600 hover:bg-red-50'}
                  onClick={() => castVote(p.policy_id, 'NO')}
                >
                  <ThumbsDown className="h-4 w-4 mr-2" />
                  Against
                </Button>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto shrink-0 justify-end md:ml-4">
                {p.file_url && (
                  <a href={p.file_url} className="text-sgvu-navy underline text-sm font-medium hover:text-blue-600" target="_blank" rel="noopener noreferrer">
                    View PDF
                  </a>
                )}
                {p.acknowledged ? (
                  <div className="flex items-center text-green-600 bg-green-50 px-3 py-1.5 rounded-md text-sm font-medium">
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Acknowledged
                  </div>
                ) : (
                  <Button onClick={() => acknowledge(p.policy_id)} size="sm">
                    Acknowledge
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
