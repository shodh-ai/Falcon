'use client';

import { FormEvent, useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { HrPageHeader } from '@/components/hr/HrPageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useHrApi } from '@/lib/api/use-hr-api';
import { useHrEntity } from '@/context/HrEntityContext';
import { Trash2, Archive } from 'lucide-react';
import Link from 'next/link';

type Policy = { 
  policy_id: string; 
  title: string; 
  category: string; 
  file_url: string | null; 
  is_mandatory: boolean;
  favour_count: number;
  against_count: number;
};

export default function HrPoliciesPage() {
  const api = useHrApi();
  const { entityId } = useHrEntity();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [form, setForm] = useState({ title: '', category: 'GENERAL', file_url: '' });

  const load = () => {
    api.get<Policy[]>('/api/hr/policies').then(setPolicies);
  };

  useEffect(() => {
    load();
  }, [api, entityId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post('/api/hr/policies', form);
      toast.success('Policy published');
      setForm({ title: '', category: 'GENERAL', file_url: '' });
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
  }

  async function removePolicy(id: string) {
    if (!confirm('Are you sure you want to archive this policy?')) return;
    try {
      await api.del(`/api/hr/policies/${id}`);
      toast.success('Policy archived');
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
  }

  return (
    <>
      <HrPageHeader 
        title="Company Policies CMS" 
        description="Upload PDFs for employees to read and acknowledge." 
        actions={
          <Link href="/hr/policies/archived">
            <Button variant="outline" size="sm" className="bg-white">
              <Archive className="mr-2 h-4 w-4" />
              Archived Policies
            </Button>
          </Link>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add policy</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700">Policy Title <span className="text-red-500">*</span></label>
              <Input placeholder="e.g. Leave Policy 2026" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700">Category</label>
              <Input placeholder="e.g. GENERAL, HR, IT" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} maxLength={60} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-medium text-slate-700">File URL (PDF link)</label>
              <Input placeholder="https://..." value={form.file_url} onChange={(e) => setForm((f) => ({ ...f, file_url: e.target.value }))} />
            </div>
            <Button type="submit" className="sm:col-span-2">Publish Policy</Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {policies.map((p) => {
          const totalVotes = (p.favour_count || 0) + (p.against_count || 0);
          const favourPercent = totalVotes > 0 ? Math.round((p.favour_count / totalVotes) * 100) : 0;
          const againstPercent = totalVotes > 0 ? 100 - favourPercent : 0;

          return (
            <Card key={p.policy_id} className="group">
              <CardContent className="flex items-center justify-between p-4 text-sm">
                <div className="w-1/3">
                  <p className="font-medium">{p.title}</p>
                  <p className="text-muted-foreground">{p.category}</p>
                </div>
                
                <div className="flex-1 px-8 hidden md:block max-w-sm">
                  <div className="text-xs text-slate-500 mb-1 flex justify-between">
                    <span className={totalVotes > 0 ? "text-green-600 font-medium" : ""}>
                      {p.favour_count || 0} In Favour {totalVotes > 0 && `(${favourPercent}%)`}
                    </span>
                    <span className={totalVotes > 0 ? "text-red-600 font-medium" : ""}>
                      {p.against_count || 0} Against {totalVotes > 0 && `(${againstPercent}%)`}
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex">
                    {totalVotes > 0 ? (
                      <>
                        <div style={{ width: `${favourPercent}%` }} className="bg-green-500 h-full"></div>
                        <div style={{ width: `${againstPercent}%` }} className="bg-red-500 h-full"></div>
                      </>
                    ) : (
                      <div className="w-full bg-slate-200 h-full"></div>
                    )}
                  </div>
                  {totalVotes === 0 && <p className="text-[10px] text-center text-slate-400 mt-1">No votes yet</p>}
                </div>

                <div className="flex items-center justify-end gap-4 w-1/3">
                  {p.file_url && (
                    <a href={p.file_url} className="text-sgvu-navy underline" target="_blank" rel="noopener noreferrer">
                      PDF
                    </a>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-600 hover:bg-red-50"
                    onClick={() => void removePolicy(p.policy_id)}
                    title="Archive Policy"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
