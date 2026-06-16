'use client';

import { useEffect, useState } from 'react';
import { Building2, Mail, Plus, UserRound } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PlacementEmptyState } from '@/components/placement/PlacementEmptyState';
import { PlacementFormField } from '@/components/placement/PlacementFormField';
import { PlacementPageHeader } from '@/components/placement/PlacementPageHeader';
import { PlacementPageShell } from '@/components/placement/PlacementPageShell';
import { useAuthedApi } from '@/lib/api';

type Company = {
  company_id: string;
  company_name: string;
  hr_email: string;
  industry?: string;
  hr_name?: string;
};

export default function PlacementCompaniesPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ company_name: '', industry: '', hr_name: '', hr_email: '' });

  const load = () => {
    setLoading(true);
    void api
      .get<Company[]>('/api/placement/companies')
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [api]);

  async function createCompany(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/api/placement/companies', form);
      toast.success('Company added to master');
      setDialogOpen(false);
      setForm({ company_name: '', industry: '', hr_name: '', hr_email: '' });
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <PlacementPageShell>
      <PlacementPageHeader
        variant="simple"
        icon={Building2}
        title="Company Master"
        description="Register visiting corporates before creating placement drives. HR contacts are used for Excel shortlist exports."
        actions={
          <Button className="bg-sgvu-gold text-sgvu-navy hover:bg-sgvu-gold/90" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add company
          </Button>
        }
      />

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl border bg-muted/40" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <PlacementEmptyState
          icon={Building2}
          title="No companies yet"
          description="Add your first visiting company to start scheduling campus drives."
          action={
            <Button className="bg-sgvu-gold text-sgvu-navy hover:bg-sgvu-gold/90" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add company
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((c) => (
            <article
              key={c.company_id}
              className="rounded-2xl border border-border/70 bg-white p-5 shadow-sm transition hover:border-sgvu-gold/40 hover:shadow-md"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sgvu-navy text-lg font-bold text-sgvu-gold">
                  {c.company_name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-sgvu-navy">{c.company_name}</p>
                  {c.industry ? (
                    <Badge variant="secondary" className="mt-1">
                      {c.industry}
                    </Badge>
                  ) : null}
                </div>
              </div>
              <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                <p className="flex items-center gap-2">
                  <UserRound className="h-4 w-4 shrink-0" />
                  {c.hr_name ?? 'HR Contact'}
                </p>
                <p className="flex items-center gap-2 truncate">
                  <Mail className="h-4 w-4 shrink-0" />
                  {c.hr_email}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle>Add visiting company</DialogTitle>
            <DialogDescription>Corporate master record used across all placement drives.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => void createCompany(e)} className="grid gap-4 sm:grid-cols-2">
            <PlacementFormField label="Company name" required className="sm:col-span-2">
              <Input
                value={form.company_name}
                required
                placeholder="Falcon Labs Pvt Ltd"
                onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
              />
            </PlacementFormField>
            <PlacementFormField label="Industry">
              <Input
                value={form.industry}
                placeholder="IT Services"
                onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
              />
            </PlacementFormField>
            <PlacementFormField label="HR contact name">
              <Input value={form.hr_name} onChange={(e) => setForm((f) => ({ ...f, hr_name: e.target.value }))} />
            </PlacementFormField>
            <PlacementFormField label="HR email" required className="sm:col-span-2">
              <Input
                type="email"
                value={form.hr_email}
                required
                onChange={(e) => setForm((f) => ({ ...f, hr_email: e.target.value }))}
              />
            </PlacementFormField>
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving} className="bg-sgvu-gold text-sgvu-navy hover:bg-sgvu-gold/90">
                Save company
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PlacementPageShell>
  );
}
