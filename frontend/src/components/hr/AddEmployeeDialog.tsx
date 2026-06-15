'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, Upload, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { useHrEntity } from '@/context/HrEntityContext';
import { useHrApi } from '@/lib/api/use-hr-api';
import { getSubdomainFromClient } from '@/lib/tenant';

type Role = { role_id: number; role_name: string };
type Dept = { dept_id: number; dept_name: string };

type Props = {
  onCreated?: () => void;
};

export function AddEmployeeDialog({ onCreated }: Props) {
  const api = useHrApi();
  const { token } = useAuth();
  const { withEntityQuery } = useHrEntity();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'manual' | 'bulk'>('manual');
  const [roles, setRoles] = useState<Role[]>([]);
  const [departments, setDepartments] = useState<Dept[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [form, setForm] = useState({
    name: '',
    official_email: '',
    phone: '',
    role: 'Faculty',
    department: '',
    employee_id: '',
    designation: '',
    joining_date: new Date().toISOString().slice(0, 10),
  });

  useEffect(() => {
    if (!open) return;
    void api
      .get<{ roles: Role[]; departments: Dept[] }>('/api/hr/metadata/roles-departments')
      .then((data) => {
        setRoles(data.roles);
        setDepartments(data.departments);
      })
      .catch(() => {});
  }, [api, open]);

  async function downloadTemplate() {
    if (!token) return;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
    const res = await fetch(`${apiUrl}${withEntityQuery('/api/hr/employees/bulk-upload/template')}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-tenant-subdomain': getSubdomainFromClient(),
      },
    });
    if (!res.ok) {
      toast.error('Failed to download template');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'employee-bulk-upload-template.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function submitManual() {
    setSubmitting(true);
    try {
      await api.post('/api/hr/employees/manual', form);
      toast.success('Employee added to onboarding pipeline');
      setOpen(false);
      onCreated?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add employee');
    } finally {
      setSubmitting(false);
    }
  }

  const uploadBulk = useCallback(
    async (file: File) => {
      if (!token) return;
      setSubmitting(true);
      try {
        const formData = new FormData();
        formData.append('file', file);
        const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
        const res = await fetch(`${apiUrl}${withEntityQuery('/api/hr/employees/bulk-upload')}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'x-tenant-subdomain': getSubdomainFromClient(),
          },
          body: formData,
        });
        const text = await res.text();
        if (!res.ok) {
          let msg = text;
          try {
            const parsed = JSON.parse(text) as { message?: string | { line?: number; message?: string } };
            if (typeof parsed.message === 'object' && parsed.message?.line) {
              msg = `Row ${parsed.message.line}: ${parsed.message.message}`;
            } else if (typeof parsed.message === 'string') {
              msg = parsed.message;
            }
          } catch {
            /* use raw text */
          }
          throw new Error(msg);
        }
        const result = JSON.parse(text) as { created: number };
        toast.success(`${result.created} employee(s) added to onboarding pipeline`);
        setOpen(false);
        onCreated?.();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Bulk upload failed');
      } finally {
        setSubmitting(false);
      }
    },
    [token, withEntityQuery, onCreated],
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="mr-2 h-4 w-4" />
          Add Employee
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Employee</DialogTitle>
          <DialogDescription>
            Manual entry or bulk upload — all new hires enter the onboarding checklist pipeline.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Button
            size="sm"
            variant={tab === 'manual' ? 'default' : 'outline'}
            onClick={() => setTab('manual')}
          >
            Manual Entry
          </Button>
          <Button
            size="sm"
            variant={tab === 'bulk' ? 'default' : 'outline'}
            onClick={() => setTab('bulk')}
          >
            Bulk Upload
          </Button>
        </div>

        {tab === 'manual' ? (
          <div className="space-y-3">
            <Input placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input placeholder="Email" type="email" value={form.official_email} onChange={(e) => setForm({ ...form, official_email: e.target.value })} />
            <Input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <select
              className="w-full rounded-md border px-3 py-2 text-sm"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              {roles.map((r) => (
                <option key={r.role_id} value={r.role_name}>
                  {r.role_name}
                </option>
              ))}
              {!roles.length && <option value="Faculty">Faculty</option>}
            </select>
            <select
              className="w-full rounded-md border px-3 py-2 text-sm"
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
            >
              <option value="">— Department —</option>
              {departments.map((d) => (
                <option key={d.dept_id} value={d.dept_name}>
                  {d.dept_name}
                </option>
              ))}
            </select>
            <Input placeholder="Employee ID (optional)" value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })} />
            <Input placeholder="Designation" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
            <Input type="date" value={form.joining_date} onChange={(e) => setForm({ ...form, joining_date: e.target.value })} />
            <Button className="w-full" disabled={submitting} onClick={() => void submitManual()}>
              {submitting ? 'Creating…' : 'Create & Start Onboarding'}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <Button variant="outline" size="sm" onClick={() => void downloadTemplate()}>
              <Download className="mr-2 h-4 w-4" />
              Download Sample Excel Template
            </Button>
            <div
              className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
                dragOver ? 'border-sgvu-gold bg-sgvu-gold/5' : 'border-muted-foreground/30'
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const file = e.dataTransfer.files[0];
                if (file) void uploadBulk(file);
              }}
            >
              <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Drag & drop .xlsx or .csv here</p>
              <label className="mt-3 inline-block cursor-pointer text-sm font-medium text-sgvu-navy underline">
                Browse files
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadBulk(file);
                  }}
                />
              </label>
            </div>
            {submitting && <p className="text-sm text-muted-foreground">Processing upload…</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
