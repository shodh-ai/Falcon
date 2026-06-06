'use client';

import { FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { HrPageHeader } from '@/components/hr/HrPageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useHrApi } from '@/lib/api/use-hr-api';
import { useHrEntity } from '@/context/HrEntityContext';

type Policy = { policy_id: string; title: string; category: string; file_url: string | null; is_mandatory: boolean };

export default function HrPoliciesPage() {
  const api = useHrApi();
  const { entityId } = useHrEntity();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [form, setForm] = useState({ title: '', category: 'GENERAL', file_url: '' });

  const load = () => void api.get<Policy[]>('/api/hr/policies').then(setPolicies);

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

  return (
    <>
      <HrPageHeader title="Company Policies CMS" description="Upload PDFs for employees to read and acknowledge." />

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
          <Card key={p.policy_id}>
            <CardContent className="flex items-center justify-between p-4 text-sm">
              <div>
                <p className="font-medium">{p.title}</p>
                <p className="text-muted-foreground">{p.category}</p>
              </div>
              {p.file_url && (
                <a href={p.file_url} className="text-sgvu-navy underline" target="_blank" rel="noopener noreferrer">
                  PDF
                </a>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
