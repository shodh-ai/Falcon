'use client';

import { useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';

type Hierarchy = {
  campuses: { campus_id: number; campus_name: string }[];
  schools: { school_id: number; school_name: string; campus_id: number }[];
  departments: { dept_id: number; dept_name: string }[];
  programs: { program_id: number; program_name: string; school_id: number }[];
  batches: { batch_id: string; batch_name: string }[];
  sections: { section_id: string; section_name: string }[];
};

type Assignment = {
  assignment_id: string;
  user_name: string;
  official_email: string;
  assignment_type: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
};

type AssignableUser = {
  user_id: string;
  name: string;
  email: string;
  role_name: string;
};

export default function SuperAdminHierarchyPage() {
  const api = useAuthedApi();
  const [tree, setTree] = useState<Hierarchy | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [sectionName, setSectionName] = useState('Section A');
  const [deanUserId, setDeanUserId] = useState('');
  const [schoolId, setSchoolId] = useState('');
  const [hodUserId, setHodUserId] = useState('');
  const [deptId, setDeptId] = useState('');
  const [studentIds, setStudentIds] = useState('');
  const [sectionId, setSectionId] = useState('');

  const load = () => {
    void api.get<Hierarchy>('/api/super-admin/hierarchy').then(setTree).catch(() => setTree(null));
    void api
      .get<Assignment[]>('/api/super-admin/assignments')
      .then(setAssignments)
      .catch(() => setAssignments([]));
    void api
      .get<AssignableUser[]>('/api/super-admin/hierarchy/assignable-users')
      .then(setUsers)
      .catch(() => setUsers([]));
  };

  useEffect(() => {
    load();
  }, [api]);

  const schools = tree?.schools ?? [];
  const departments = tree?.departments ?? [];
  const sections = tree?.sections ?? [];

  async function createSection() {
    try {
      await api.post('/api/super-admin/sections', { section_name: sectionName });
      toast.success('Section created');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  }

  async function assignDean() {
    if (!deanUserId) {
      toast.error('Select a dean / faculty user');
      return;
    }
    if (!schoolId) {
      toast.error('Select a school');
      return;
    }
    try {
      await api.post('/api/super-admin/assignments', {
        user_id: deanUserId,
        assignment_type: 'DEAN',
        entity_type: 'SCHOOL',
        entity_id: schoolId,
      });
      toast.success('Dean assigned');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  }

  async function assignHod() {
    if (!hodUserId) {
      toast.error('Select a faculty user for HOD');
      return;
    }
    if (!deptId) {
      toast.error('Select a department');
      return;
    }
    try {
      await api.post('/api/super-admin/assignments', {
        user_id: hodUserId,
        assignment_type: 'HOD',
        entity_type: 'DEPARTMENT',
        entity_id: deptId,
      });
      toast.success('HOD assigned');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  }

  async function bulkAssign() {
    if (!sectionId) {
      toast.error('Select a section');
      return;
    }
    try {
      const ids = studentIds.split(',').map((s) => s.trim()).filter(Boolean);
      if (!ids.length) {
        toast.error('Enter at least one student UUID');
        return;
      }
      await api.post('/api/super-admin/sections/bulk-assign', {
        section_id: sectionId,
        student_user_ids: ids,
      });
      toast.success(`Assigned ${ids.length} students`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Hierarchy Mapper</h1>
      <p className="text-sm text-muted-foreground">
        Assign deans to schools and HODs to departments using the dropdowns below — no manual UUID typing required.
      </p>
      {tree && (
        <div className="grid gap-4 lg:grid-cols-3">
          {['campuses', 'schools', 'departments', 'programs', 'batches', 'sections'].map((key) => (
            <Card key={key}>
              <CardHeader>
                <CardTitle className="text-sm capitalize">{key}</CardTitle>
              </CardHeader>
              <CardContent className="max-h-48 space-y-1 overflow-y-auto text-xs">
                {(tree[key as keyof Hierarchy] as { [k: string]: unknown }[]).map((item, i) => (
                  <div key={i} className="rounded border px-2 py-1">
                    {String(Object.values(item).find((v) => typeof v === 'string') ?? JSON.stringify(item))}
                  </div>
                ))}
                {!(tree[key as keyof Hierarchy] as unknown[]).length && (
                  <p className="text-muted-foreground">None yet</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Entity assigner</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <Input placeholder="New section name" value={sectionName} onChange={(e) => setSectionName(e.target.value)} />
          <Button onClick={() => void createSection()}>Create section</Button>

          <select
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={deanUserId}
            onChange={(e) => setDeanUserId(e.target.value)}
          >
            <option value="">Select dean / faculty user…</option>
            {users.map((u) => (
              <option key={u.user_id} value={u.user_id}>
                {u.name} · {u.role_name} · {u.email}
              </option>
            ))}
          </select>
          <select
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={schoolId}
            onChange={(e) => setSchoolId(e.target.value)}
          >
            <option value="">Select school…</option>
            {schools.map((s) => (
              <option key={s.school_id} value={String(s.school_id)}>
                #{s.school_id} · {s.school_name}
              </option>
            ))}
          </select>
          <Button variant="outline" onClick={() => void assignDean()} disabled={!schools.length}>
            Assign dean to school
          </Button>

          <select
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={hodUserId}
            onChange={(e) => setHodUserId(e.target.value)}
          >
            <option value="">Select HOD / faculty user…</option>
            {users.map((u) => (
              <option key={`hod-${u.user_id}`} value={u.user_id}>
                {u.name} · {u.role_name}
              </option>
            ))}
          </select>
          <select
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={deptId}
            onChange={(e) => setDeptId(e.target.value)}
          >
            <option value="">Select department…</option>
            {departments.map((d) => (
              <option key={d.dept_id} value={String(d.dept_id)}>
                #{d.dept_id} · {d.dept_name}
              </option>
            ))}
          </select>
          <Button variant="outline" onClick={() => void assignHod()} disabled={!departments.length}>
            Assign HOD to department
          </Button>

          <select
            className="rounded-md border border-input bg-background px-3 py-2 text-sm md:col-span-1"
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
          >
            <option value="">Select section…</option>
            {sections.map((s) => (
              <option key={s.section_id} value={s.section_id}>
                {s.section_name}
              </option>
            ))}
          </select>
          <Input
            placeholder="Student UUIDs (comma-separated)"
            value={studentIds}
            onChange={(e) => setStudentIds(e.target.value)}
          />
          <Button onClick={() => void bulkAssign()}>Bulk assign to section</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current hierarchy assignments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {assignments.map((row) => (
            <div key={row.assignment_id} className="rounded border px-3 py-2">
              <span className="font-medium">{row.user_name}</span>
              <span className="text-muted-foreground">
                {' '}
                · {row.assignment_type} on {row.entity_type} #{row.entity_id}
              </span>
            </div>
          ))}
          {!assignments.length && (
            <p className="text-muted-foreground">No dean/HOD assignments recorded yet.</p>
          )}
          {!schools.length && (
            <p className="text-amber-700">
              No schools in hierarchy yet — dean assignment needs at least one school row in the database.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
