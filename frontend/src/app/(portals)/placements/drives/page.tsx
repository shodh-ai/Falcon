'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Briefcase, Calendar, IndianRupee, Kanban, Loader2, Pencil, Plus, Target, XCircle } from 'lucide-react';
import { toast } from 'sonner';
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
import { PlacementFormField, selectClassName, textareaClassName } from '@/components/placement/PlacementFormField';
import { PlacementPageHeader } from '@/components/placement/PlacementPageHeader';
import { PlacementPageShell } from '@/components/placement/PlacementPageShell';
import { useAuthedApi } from '@/lib/api';

type Drive = {
  drive_id: string;
  company_name: string;
  job_profile: string;
  job_role?: string;
  min_cgpa: string;
  max_backlogs: number;
  package_details_lpa: string;
  package_lpa?: string;
  status: string;
  deadline?: string;
};

type Company = { company_id: string; company_name: string };

const EMPTY_FORM = {
  company_id: '',
  job_profile: '',
  description: '',
  package_lpa: '6',
  min_cgpa: '6',
  max_backlogs: '0',
  deadline: '',
};

export default function PlacementDrivesPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<Drive[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDrive, setEditDrive] = useState<Drive | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const [editFields, setEditFields] = useState({ min_cgpa: '0', max_backlogs: '0', package_lpa: '6' });

  const load = () => {
    setLoading(true);
    void api
      .get<Drive[]>('/api/placement/drives')
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    void api.get<Company[]>('/api/placement/companies').then(setCompanies).catch(() => setCompanies([]));
  }, [api]);

  function openEdit(drive: Drive) {
    setEditDrive(drive);
    setEditFields({
      min_cgpa: String(drive.min_cgpa ?? '0'),
      max_backlogs: String(drive.max_backlogs ?? '0'),
      package_lpa: String(drive.package_lpa ?? drive.package_details_lpa ?? '0'),
    });
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editDrive) return;
    setSaving(true);
    try {
      await api.patch(`/api/placement/drives/${editDrive.drive_id}`, {
        min_cgpa: Number(editFields.min_cgpa),
        max_backlogs: Number(editFields.max_backlogs),
        package_lpa: Number(editFields.package_lpa),
      });
      toast.success('Drive criteria updated — students see changes immediately');
      setEditDrive(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  }

  async function closeDrive(drive: Drive) {
    try {
      await api.patch(`/api/placement/drives/${drive.drive_id}`, { status: 'CLOSED' });
      toast.success('Drive closed — hidden from students');
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Close failed');
    }
  }

  async function createDrive(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/api/placement/drives', {
        company_id: form.company_id,
        job_profile: form.job_profile,
        job_role: form.job_profile,
        description: form.description || null,
        package_lpa: Number(form.package_lpa),
        min_cgpa: Number(form.min_cgpa),
        max_backlogs: Number(form.max_backlogs),
        deadline: form.deadline ? new Date(form.deadline).toISOString() : null,
      });
      toast.success('Drive published — students notified');
      setDialogOpen(false);
      setForm(EMPTY_FORM);
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
        icon={Briefcase}
        title="Placement Drives"
        description="Publish campus roles with CGPA gates. Open the ATS board to drag students through interview rounds."
        actions={
          <Button className="bg-sgvu-gold text-sgvu-navy hover:bg-sgvu-gold/90" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New drive
          </Button>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-sgvu-navy" />
        </div>
      ) : rows.length === 0 ? (
        <PlacementEmptyState
          icon={Briefcase}
          title="No drives published"
          description={companies.length === 0 ? 'Add a company first, then create your first placement drive.' : 'Create a drive to start receiving student applications.'}
          action={
            <Button className="bg-sgvu-gold text-sgvu-navy hover:bg-sgvu-gold/90" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create drive
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4">
          {rows.map((d) => {
            const role = d.job_role ?? d.job_profile;
            const pkg = d.package_lpa ?? d.package_details_lpa;
            const isActive = d.status === 'ACTIVE' || d.status === 'OPEN';

            return (
              <article
                key={d.drive_id}
                className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-white p-5 shadow-sm transition hover:border-sgvu-gold/40 hover:shadow-md md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-lg font-bold text-sgvu-navy">{role}</p>
                    <Badge variant={isActive ? 'success' : 'secondary'}>{d.status}</Badge>
                  </div>
                  <p className="mt-0.5 text-sm font-medium text-muted-foreground">{d.company_name}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                      <IndianRupee className="h-3.5 w-3.5" />
                      {Number(pkg).toFixed(1)} LPA
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                      <Target className="h-3.5 w-3.5" />
                      Min CGPA {d.min_cgpa}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                      Max backlogs {d.max_backlogs}
                    </span>
                    {d.deadline ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                        <Calendar className="h-3.5 w-3.5" />
                        {new Date(d.deadline).toLocaleDateString()}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(d)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit criteria
                  </Button>
                  {isActive ? (
                    <Button variant="outline" size="sm" onClick={() => void closeDrive(d)}>
                      <XCircle className="mr-2 h-4 w-4" />
                      Close
                    </Button>
                  ) : null}
                  <Button asChild size="sm" className="bg-sgvu-navy text-white hover:bg-sgvu-navy/90">
                    <Link href={`/placements/drives/${d.drive_id}`}>
                      <Kanban className="mr-2 h-4 w-4" />
                      ATS
                    </Link>
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl rounded-2xl">
          <DialogHeader>
            <DialogTitle>Create placement drive</DialogTitle>
            <DialogDescription>Eligible students receive a bell notification instantly.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => void createDrive(e)} className="grid gap-4 sm:grid-cols-2">
            <PlacementFormField label="Company" required className="sm:col-span-2">
              <select
                className={selectClassName}
                value={form.company_id}
                required
                onChange={(e) => setForm((f) => ({ ...f, company_id: e.target.value }))}
              >
                <option value="">Select company</option>
                {companies.map((c) => (
                  <option key={c.company_id} value={c.company_id}>
                    {c.company_name}
                  </option>
                ))}
              </select>
            </PlacementFormField>
            <PlacementFormField label="Job role" required>
              <Input
                value={form.job_profile}
                required
                placeholder="Software Engineer Trainee"
                onChange={(e) => setForm((f) => ({ ...f, job_profile: e.target.value }))}
              />
            </PlacementFormField>
            <PlacementFormField label="Package (LPA)" hint="Offers above ₹5 LPA trigger one-student-one-offer lock">
              <Input type="number" step="0.1" value={form.package_lpa} onChange={(e) => setForm((f) => ({ ...f, package_lpa: e.target.value }))} />
            </PlacementFormField>
            <PlacementFormField label="Min CGPA" hint="Use 0 for no minimum">
              <Input type="number" step="0.1" min={0} value={form.min_cgpa} onChange={(e) => setForm((f) => ({ ...f, min_cgpa: e.target.value }))} />
            </PlacementFormField>
            <PlacementFormField label="Max active backlogs">
              <Input type="number" value={form.max_backlogs} onChange={(e) => setForm((f) => ({ ...f, max_backlogs: e.target.value }))} />
            </PlacementFormField>
            <PlacementFormField label="Application deadline" required className="sm:col-span-2">
              <Input type="datetime-local" value={form.deadline} required onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))} />
            </PlacementFormField>
            <PlacementFormField label="Job description" className="sm:col-span-2">
              <textarea
                className={textareaClassName}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Role overview, skills required, interview process..."
              />
            </PlacementFormField>
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving} className="bg-sgvu-gold text-sgvu-navy hover:bg-sgvu-gold/90">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Publish drive
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editDrive)} onOpenChange={(open) => !open && setEditDrive(null)}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Edit eligibility criteria</DialogTitle>
            <DialogDescription>
              {editDrive?.job_role ?? editDrive?.job_profile} at {editDrive?.company_name}. Changes apply instantly for all students.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => void saveEdit(e)} className="grid gap-4">
            <PlacementFormField label="Min CGPA" hint="Set to 0 to allow any CGPA">
              <Input
                type="number"
                step="0.1"
                min={0}
                value={editFields.min_cgpa}
                onChange={(e) => setEditFields((f) => ({ ...f, min_cgpa: e.target.value }))}
              />
            </PlacementFormField>
            <PlacementFormField label="Max active backlogs">
              <Input
                type="number"
                min={0}
                value={editFields.max_backlogs}
                onChange={(e) => setEditFields((f) => ({ ...f, max_backlogs: e.target.value }))}
              />
            </PlacementFormField>
            <PlacementFormField label="Package (LPA)">
              <Input
                type="number"
                step="0.1"
                min={0}
                value={editFields.package_lpa}
                onChange={(e) => setEditFields((f) => ({ ...f, package_lpa: e.target.value }))}
              />
            </PlacementFormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditDrive(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving} className="bg-sgvu-gold text-sgvu-navy hover:bg-sgvu-gold/90">
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PlacementPageShell>
  );
}
