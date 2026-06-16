'use client';

import { useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { HrPageHeader } from '@/components/hr/HrPageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useHrApi } from '@/lib/api/use-hr-api';
import { useHrEntity } from '@/context/HrEntityContext';
import { RotateCcw, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

type Policy = { policy_id: string; title: string; category: string; file_url: string | null; is_mandatory: boolean };

export default function HrArchivedPoliciesPage() {
  const api = useHrApi();
  const { entityId } = useHrEntity();
  const [archived, setArchived] = useState<Policy[]>([]);

  const load = () => {
    api.get<Policy[]>('/api/hr/policies/archived').then(setArchived);
  };

  useEffect(() => {
    load();
  }, [api, entityId]);

  async function restorePolicy(id: string) {
    try {
      await api.put(`/api/hr/policies/${id}/restore`);
      toast.success('Policy restored successfully');
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to restore policy');
    }
  }

  return (
    <>
      <HrPageHeader 
        title="Archived Policies" 
        description="View and restore previously removed company policies."
        actions={
          <Link href="/hr/policies">
            <Button variant="outline" size="sm" className="bg-white">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Policies
            </Button>
          </Link>
        }
      />

      <Card className="mt-6">
        <CardContent className="p-6">
          {archived.length === 0 ? (
            <div className="text-center py-10 text-slate-500 text-sm">
              No archived policies found.
            </div>
          ) : (
            <div className="space-y-3">
              {archived.map((p) => (
                <Card key={p.policy_id} className="group bg-slate-50 border-slate-200 border-dashed transition-all hover:bg-white hover:border-solid hover:shadow-sm">
                  <CardContent className="flex items-center justify-between p-4 text-sm">
                    <div>
                      <p className="font-medium text-slate-700 line-through">{p.title}</p>
                      <p className="text-muted-foreground">{p.category}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      {p.file_url && (
                        <a href={p.file_url} className="text-sgvu-navy underline" target="_blank" rel="noopener noreferrer">
                          PDF
                        </a>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-slate-500 hover:text-green-600 hover:bg-green-50"
                        onClick={() => void restorePolicy(p.policy_id)}
                      >
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Restore
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
