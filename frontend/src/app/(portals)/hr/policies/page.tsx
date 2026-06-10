'use client';

import { FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { HrPageHeader } from '@/components/hr/HrPageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useHrApi } from '@/lib/api/use-hr-api';
import { useHrEntity } from '@/context/HrEntityContext';
import { Trash2, Archive } from 'lucide-react';
import Link from 'next/link';

type Policy = { policy_id: string; title: string; category: string; file_url: string | null; is_mandatory: boolean };

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
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
            <Input placeholder="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required />
            <Input placeholder="Category" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
            <Input placeholder="File URL" className="sm:col-span-2" value={form.file_url} onChange={(e) => setForm((f) => ({ ...f, file_url: e.target.value }))} />
            <Button type="submit" className="sm:col-span-2">Publish</Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {policies.map((p) => (
          <Card key={p.policy_id} className="group">
            <CardContent className="flex items-center justify-between p-4 text-sm">
              <div>
                <p className="font-medium">{p.title}</p>
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
        ))}
      </div>
    </>
  );
}
