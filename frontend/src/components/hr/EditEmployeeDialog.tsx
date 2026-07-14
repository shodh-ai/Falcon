'use client';

import { Select } from '@/components/ui/select';
import { useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
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
import { useHrApi } from '@/lib/api/use-hr-api';
import { type PaginatedResponse } from '@/lib/api/pagination';

type Role = { role_id: number; role_name: string };
type Dept = { dept_id: number; dept_name: string };
type OfficerOption = { user_id: string; name: string };

export type EditableEmployee = {
  user_id: string;
  name: string;
  email: string;
  employee_id: string | null;
  designation: string | null;
  department: string | null;
  role: string | null;
  joining_date: string | null;
  reporting_officer_name: string | null;
};

type Employee360 = {
  user_id: string;
  name: string;
  email: string;
  role: string | null;
  role_id: number | null;
  department: string | null;
  dept_id: number | null;
  salary_base: string | null;
  employee_id: string | null;
  designation: string | null;
  joining_date: string | null;
  reporting_officer_id: string | null;
  reporting_officer_name: string | null;
};

type Props = {
  employee: EditableEmployee;
  onUpdated?: () => void;
};

function toDateInput(value: string | null | undefined) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

export function EditEmployeeDialog({ employee, onUpdated }: Props) {
  const api = useHrApi();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [roles, setRoles] = useState<Role[]>([]);
  const [departments, setDepartments] = useState<Dept[]>([]);
  const [officers, setOfficers] = useState<OfficerOption[]>([]);
  const [form, setForm] = useState({
    role_id: '',
    dept_id: '',
    employee_id: '',
    designation: '',
    joining_date: '',
    reporting_officer_id: '',
    salary_base: '',
  });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [meta, profile, directory] = await Promise.all([
          api.get<{ roles: Role[]; departments: Dept[] }>('/api/hr/metadata/roles-departments'),
          api.get<Employee360>(`/api/hr/employees/${employee.user_id}/360`),
          api.get<PaginatedResponse<OfficerOption>>('/api/hr/directory?limit=200&offset=0'),
        ]);
        if (cancelled) return;

        setRoles(meta.roles);
        setDepartments(meta.departments);
        setOfficers(
          (directory.data ?? [])
            .filter((row) => row.user_id !== employee.user_id)
            .map((row) => ({ user_id: row.user_id, name: row.name })),
        );

        const matchedRole =
          profile.role_id ??
          meta.roles.find((r) => r.role_name === (profile.role ?? employee.role))?.role_id;
        const matchedDept =
          profile.dept_id ??
          meta.departments.find((d) => d.dept_name === (profile.department ?? employee.department))
            ?.dept_id;

        setForm({
          role_id: matchedRole != null ? String(matchedRole) : '',
          dept_id: matchedDept != null ? String(matchedDept) : '',
          employee_id: profile.employee_id ?? employee.employee_id ?? '',
          designation: profile.designation ?? employee.designation ?? '',
          joining_date: toDateInput(profile.joining_date ?? employee.joining_date),
          reporting_officer_id: profile.reporting_officer_id ?? '',
          salary_base: profile.salary_base ?? '',
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load employee');
        setOpen(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [api, employee, open]);

  async function submit() {
    setSubmitting(true);
    try {
      const roleId = form.role_id ? Number(form.role_id) : undefined;
      const deptId = form.dept_id ? Number(form.dept_id) : undefined;

      await Promise.all([
        api.patch(`/api/hr/employees/${employee.user_id}`, {
          ...(roleId != null && !Number.isNaN(roleId) ? { role_id: roleId } : {}),
          ...(deptId != null && !Number.isNaN(deptId) ? { dept_id: deptId } : {}),
          reporting_officer_id: form.reporting_officer_id || null,
          ...(form.salary_base.trim() ? { salary_base: form.salary_base.trim() } : {}),
        }),
        api.patch(`/api/hr/employees/${employee.user_id}/master`, {
          employee_id: form.employee_id.trim() || undefined,
          designation: form.designation.trim() || undefined,
          joining_date: form.joining_date || undefined,
        }),
      ]);

      toast.success('Employee updated');
      setOpen(false);
      onUpdated?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update employee');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground hover:text-sgvu-navy"
          aria-label={`Edit ${employee.name}`}
          title="Edit employee"
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Employee</DialogTitle>
          <DialogDescription>
            Update employment details for {employee.name}. Name and email stay linked to the account login.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading employee details…</p>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
              <p className="font-semibold text-gray-900">{employee.name}</p>
              <p className="text-xs text-muted-foreground">{employee.email}</p>
            </div>

            <Select
              className="w-full rounded-md border px-3 py-2 text-sm"
              value={form.role_id}
              onChange={(e) => setForm({ ...form, role_id: e.target.value })}
            >
              <option value="">— Role —</option>
              {roles.map((r) => (
                <option key={r.role_id} value={String(r.role_id)}>
                  {r.role_name}
                </option>
              ))}
            </Select>

            <Select
              className="w-full rounded-md border px-3 py-2 text-sm"
              value={form.dept_id}
              onChange={(e) => setForm({ ...form, dept_id: e.target.value })}
            >
              <option value="">— Department —</option>
              {departments.map((d) => (
                <option key={d.dept_id} value={String(d.dept_id)}>
                  {d.dept_name}
                </option>
              ))}
            </Select>

            <Input
              placeholder="Employee ID"
              value={form.employee_id}
              onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
            />
            <Input
              placeholder="Designation"
              value={form.designation}
              onChange={(e) => setForm({ ...form, designation: e.target.value })}
            />
            <Input
              type="date"
              value={form.joining_date}
              onChange={(e) => setForm({ ...form, joining_date: e.target.value })}
            />

            <Select
              className="w-full rounded-md border px-3 py-2 text-sm"
              value={form.reporting_officer_id}
              onChange={(e) => setForm({ ...form, reporting_officer_id: e.target.value })}
            >
              <option value="">— Reporting officer —</option>
              {officers.map((o) => (
                <option key={o.user_id} value={o.user_id}>
                  {o.name}
                </option>
              ))}
            </Select>

            <Input
              placeholder="Base salary (optional)"
              value={form.salary_base}
              onChange={(e) => setForm({ ...form, salary_base: e.target.value })}
            />

            <Button className="w-full" disabled={submitting} onClick={() => void submit()}>
              {submitting ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
