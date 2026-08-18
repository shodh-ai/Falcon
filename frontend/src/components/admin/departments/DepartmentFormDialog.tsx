'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { REG_BRAND_BTN, REG_OUTLINE_BTN } from '@/components/admin/registrar-desk/RegistrarDeskChrome';
import { useAuthedApi } from '@/lib/api';
import { toast } from '@/lib/notifications/falcon-toast';
import { cn } from '@/lib/utils';
import type { DepartmentListRow, DepartmentLookups, HodCandidate } from './department-types';

export function DepartmentFormDialog({
  open,
  onOpenChange,
  lookups,
  department,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lookups: DepartmentLookups;
  department?: DepartmentListRow | null;
  onSaved: () => void;
}) {
  const api = useAuthedApi();
  const isEdit = Boolean(department);
  const [saving, setSaving] = useState(false);
  const [campusId, setCampusId] = useState('');
  const [schoolId, setSchoolId] = useState('');
  const [deptName, setDeptName] = useState('');
  const [description, setDescription] = useState('');
  const [hodUserId, setHodUserId] = useState('');
  const [candidates, setCandidates] = useState<HodCandidate[]>([]);

  useEffect(() => {
    if (!open) return;
    setDeptName(department?.dept_name ?? '');
    setDescription(department?.description ?? '');
    setCampusId(department?.campus_id ? String(department.campus_id) : '');
    setSchoolId(department?.school_id ? String(department.school_id) : '');
    setHodUserId(department?.hod_user_id ?? '');
  }, [open, department]);

  useEffect(() => {
    if (!open) return;
    void api
      .get<HodCandidate[]>('/api/admin-control/hod/candidates')
      .then((rows) => setCandidates(Array.isArray(rows) ? rows : []))
      .catch(() => setCandidates([]));
  }, [api, open]);

  const schoolsForCampus = useMemo(
    () =>
      lookups.schools.filter(
        (school) => !campusId || String(school.campus_id) === campusId,
      ),
    [lookups.schools, campusId],
  );

  async function save() {
    const name = deptName.trim();
    if (name.length < 2) {
      toast.error('Department name is required.');
      return;
    }
    if (!schoolId) {
      toast.error('Select a school so the department sits in the campus → school hierarchy.');
      return;
    }
    const selectedSchool = lookups.schools.find((school) => String(school.school_id) === schoolId);
    if (campusId && selectedSchool && String(selectedSchool.campus_id) !== campusId) {
      toast.error('The selected school does not belong to that campus.');
      return;
    }
    setSaving(true);
    try {
      const body = {
        dept_name: name,
        description: description.trim() || null,
        school_id: Number(schoolId),
        hod_user_id: hodUserId || null,
      };
      if (isEdit && department) {
        await api.patch(`/api/admin-control/departments/${department.dept_id}`, body);
        toast.success('Department updated.');
      } else {
        await api.post('/api/admin-control/departments', body);
        toast.success('Department created.');
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to save department.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Department' : 'Add Department'}</DialogTitle>
          <DialogDescription>
            Departments belong to a school, and the school belongs to a campus. Only fields that exist
            on the Falcon department record are shown.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <label className="block space-y-1.5 text-sm">
            <span className="font-semibold text-sgvu-navy">Department Name</span>
            <Input
              value={deptName}
              onChange={(e) => setDeptName(e.target.value)}
              placeholder="Computer Science"
              className="h-11 rounded-xl border-sgvu-navy/15"
            />
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="font-semibold text-sgvu-navy">Description</span>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Optional"
              className="rounded-xl border-sgvu-navy/15"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5 text-sm">
              <span className="font-semibold text-sgvu-navy">Campus</span>
              <Select
                value={campusId}
                onChange={(e) => {
                  setCampusId(e.target.value);
                  setSchoolId('');
                }}
                className="h-11 rounded-xl border-sgvu-navy/15"
              >
                <option value="">Select campus</option>
                {lookups.campuses.map((campus) => (
                  <option key={campus.campus_id} value={campus.campus_id}>
                    {campus.campus_name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="font-semibold text-sgvu-navy">School</span>
              <Select
                value={schoolId}
                onChange={(e) => setSchoolId(e.target.value)}
                className="h-11 rounded-xl border-sgvu-navy/15"
              >
                <option value="">Select school</option>
                {schoolsForCampus.map((school) => (
                  <option key={school.school_id} value={school.school_id}>
                    {school.school_name}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          <label className="block space-y-1.5 text-sm">
            <span className="font-semibold text-sgvu-navy">Head of Department</span>
            <Select
              value={hodUserId}
              onChange={(e) => setHodUserId(e.target.value)}
              className="h-11 rounded-xl border-sgvu-navy/15"
            >
              <option value="">Unassigned</option>
              {candidates.map((person) => (
                <option key={person.user_id} value={person.user_id}>
                  {person.name}
                  {person.role_name ? ` · ${person.role_name}` : ''}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">
              HOD is assigned from existing Faculty, HOD, or Dean records.
            </p>
          </label>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" className={cn(REG_OUTLINE_BTN, 'h-10')} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" className={cn(REG_BRAND_BTN, 'h-10')} disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create department'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
