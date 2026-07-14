'use client';



import { useEffect, useMemo, useState } from 'react';

import { toast } from '@/lib/notifications/falcon-toast';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { Button } from '@/components/ui/button';

import { useAuthedApi } from '@/lib/api';



type Hierarchy = {

  campuses: { campus_id: number; campus_name: string }[];

  schools: { school_id: number; school_name: string; campus_id: number }[];

  departments: {

    dept_id: number;

    dept_name: string;

    school_id?: number | null;

    school_ids?: number[];

  }[];

  programs: { program_id: number; program_name: string; school_id: number }[];

  batches: { batch_id: string; batch_name: string }[];

};



type Assignment = {

  assignment_id: string;

  user_name: string;

  official_email: string;

  assignment_type: string;

  entity_type: string;

  entity_id: string;

  entity_name?: string | null;

  created_at: string;

};



type AssignableUser = {

  user_id: string;

  name: string;

  email: string;

  role_name: string;

};



const TREE_KEYS = ['campuses', 'schools', 'departments', 'programs', 'batches'] as const;



function treeItemLabel(

  key: (typeof TREE_KEYS)[number],

  item: Record<string, unknown>,

  schoolNameById: Map<string, string>,

) {

  if (key === 'departments') {

    const deptName = String(item.dept_name ?? '');

    const schoolId = item.school_id != null ? String(item.school_id) : '';

    const schoolName = schoolId ? schoolNameById.get(schoolId) : null;

    return schoolName ? `${deptName} · ${schoolName}` : deptName;

  }

  return String(

    Object.values(item).find((v) => typeof v === 'string' && !/^\d+$/.test(v)) ??

      JSON.stringify(item),

  );

}



export default function SuperAdminHierarchyPage() {

  const api = useAuthedApi();

  const [tree, setTree] = useState<Hierarchy | null>(null);

  const [assignments, setAssignments] = useState<Assignment[]>([]);

  const [users, setUsers] = useState<AssignableUser[]>([]);

  const [deanUserId, setDeanUserId] = useState('');

  const [schoolId, setSchoolId] = useState('');

  const [hodUserId, setHodUserId] = useState('');

  const [deptId, setDeptId] = useState('');

  const [linkSchoolId, setLinkSchoolId] = useState('');

  const [linkDeptId, setLinkDeptId] = useState('');

  const [linking, setLinking] = useState(false);

  const [revokingId, setRevokingId] = useState<string | null>(null);



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



  const schoolNameById = useMemo(

    () => new Map(schools.map((s) => [String(s.school_id), s.school_name])),

    [schools],

  );



  const departmentsForSchool = useMemo(() => {

    if (!schoolId) return departments;

    const sid = Number(schoolId);

    const linked = departments.filter((d) => d.school_ids?.includes(sid));

    return linked.length ? linked : departments;

  }, [departments, schoolId]);



  const departmentNameById = useMemo(

    () => new Map(departments.map((d) => [String(d.dept_id), d.dept_name])),

    [departments],

  );



  function assignmentTargetLabel(row: Assignment) {

    const fromApi = row.entity_name?.trim();

    if (fromApi && fromApi !== row.entity_id) return fromApi;



    const entityType = row.entity_type?.toUpperCase();

    if (entityType === 'DEPARTMENT') {

      return departmentNameById.get(String(row.entity_id)) ?? `Department #${row.entity_id}`;

    }

    if (entityType === 'SCHOOL') {

      return schoolNameById.get(String(row.entity_id)) ?? `School #${row.entity_id}`;

    }

    return `${row.entity_type} #${row.entity_id}`;

  }



  useEffect(() => {

    if (!deptId && departmentsForSchool.length === 1) {

      setDeptId(String(departmentsForSchool[0].dept_id));

    }

  }, [departmentsForSchool, deptId]);



  useEffect(() => {

    if (!deptId) return;

    if (!departmentsForSchool.some((d) => String(d.dept_id) === deptId)) {

      setDeptId('');

    }

  }, [departmentsForSchool, deptId]);



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

    if (!schoolId) {

      toast.error('Select a school first — departments are filtered by school');

      return;

    }

    if (!deptId) {

      toast.error(

        departmentsForSchool.length

          ? 'Select a department for this school'

          : 'No departments linked to this school — link a department first',

      );

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



  async function linkDepartmentToSchool() {

    if (!linkSchoolId) {

      toast.error('Select a school');

      return;

    }

    if (!linkDeptId) {

      toast.error('Select a department');

      return;

    }

    setLinking(true);

    try {

      await api.patch(`/api/super-admin/departments/${linkDeptId}/school`, {

        school_id: Number(linkSchoolId),

      });

      toast.success('Department linked to school');

      load();

    } catch (e) {

      toast.error(e instanceof Error ? e.message : 'Failed to link department');

    } finally {

      setLinking(false);

    }

  }



  async function revokeAssignment(assignmentId: string) {

    setRevokingId(assignmentId);

    try {

      await api.del(`/api/super-admin/assignments/${assignmentId}`);

      toast.success('Assignment revoked');

      load();

    } catch (e) {

      toast.error(e instanceof Error ? e.message : 'Failed to revoke');

    } finally {

      setRevokingId(null);

    }

  }



  return (

    <div className="space-y-6 p-6">

      <h1 className="text-2xl font-bold">Hierarchy Mapper</h1>

      <p className="text-sm text-muted-foreground">

        Link departments to schools, assign deans to schools, and assign HODs to departments.

      </p>

      {tree && (

        <div className="grid gap-4 lg:grid-cols-3">

          {TREE_KEYS.map((key) => (

            <Card key={key}>

              <CardHeader>

                <CardTitle className="text-sm capitalize">{key}</CardTitle>

              </CardHeader>

              <CardContent className="max-h-48 space-y-1 overflow-y-auto text-xs">

                {(tree[key] as Record<string, unknown>[]).map((item, i) => (

                  <div key={i} className="rounded border px-2 py-1">

                    {treeItemLabel(key, item, schoolNameById)}

                  </div>

                ))}

                {!(tree[key] as unknown[]).length && (

                  <p className="text-muted-foreground">None yet</p>

                )}

              </CardContent>

            </Card>

          ))}

        </div>

      )}



      <div className="grid gap-4 lg:grid-cols-3">

        <Card>

          <CardHeader>

            <CardTitle className="text-base">Link department to school</CardTitle>

          </CardHeader>

          <CardContent className="grid gap-3">

            <select

              className="rounded-md border border-input bg-background px-3 py-2 text-sm"

              value={linkSchoolId}

              onChange={(e) => setLinkSchoolId(e.target.value)}

            >

              <option value="">Select school…</option>

              {schools.map((s) => (

                <option key={`link-school-${s.school_id}`} value={String(s.school_id)}>

                  #{s.school_id} · {s.school_name}

                </option>

              ))}

            </select>

            <select

              className="rounded-md border border-input bg-background px-3 py-2 text-sm"

              value={linkDeptId}

              onChange={(e) => setLinkDeptId(e.target.value)}

            >

              <option value="">Select department…</option>

              {departments.map((d) => (

                <option key={`link-dept-${d.dept_id}`} value={String(d.dept_id)}>

                  #{d.dept_id} · {d.dept_name}

                  {d.school_id

                    ? ` (currently: ${schoolNameById.get(String(d.school_id)) ?? 'linked'})`

                    : ''}

                </option>

              ))}

            </select>

            <Button

              variant="outline"

              onClick={() => void linkDepartmentToSchool()}

              disabled={linking || !schools.length || !departments.length}

            >

              {linking ? 'Linking…' : 'Link department to school'}

            </Button>

          </CardContent>

        </Card>



        <Card>

          <CardHeader>

            <CardTitle className="text-base">Assign dean to school</CardTitle>

          </CardHeader>

          <CardContent className="grid gap-3">

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

              onChange={(e) => {

                setSchoolId(e.target.value);

                setDeptId('');

              }}

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

          </CardContent>

        </Card>



        <Card>

          <CardHeader>

            <CardTitle className="text-base">Assign HOD to department</CardTitle>

          </CardHeader>

          <CardContent className="grid gap-3">

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

              disabled={!schoolId}

            >

              <option value="">

                {schoolId

                  ? departmentsForSchool.length

                    ? 'Select department…'

                    : 'No departments linked to this school'

                  : 'Select a school first…'}

              </option>

              {departmentsForSchool.map((d) => (

                <option key={d.dept_id} value={String(d.dept_id)}>

                  #{d.dept_id} · {d.dept_name}

                </option>

              ))}

            </select>

            <Button

              variant="outline"

              onClick={() => void assignHod()}

              disabled={!schoolId || !departmentsForSchool.length}

            >

              Assign HOD to department

            </Button>

            {!departments.length && (

              <p className="text-sm text-amber-700">

                No departments in the database yet. Run academic seed migrations before assigning an HOD.

              </p>

            )}

            {schoolId && !departmentsForSchool.length && departments.length > 0 && (

              <p className="text-sm text-amber-700">

                No department is linked to this school. Use &quot;Link department to school&quot; first.

              </p>

            )}

          </CardContent>

        </Card>

      </div>



      <Card>

        <CardHeader>

          <CardTitle className="text-base">Current hierarchy assignments</CardTitle>

        </CardHeader>

        <CardContent className="space-y-2 text-sm">

          {assignments.map((row) => (

            <div

              key={row.assignment_id}

              className="flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2"

            >

              <div>

                <span className="font-medium">{row.user_name}</span>

                <span className="text-muted-foreground">

                  {' '}

                  · {row.assignment_type} on {assignmentTargetLabel(row)}

                </span>

              </div>

              <Button

                variant="ghost"

                size="sm"

                className="text-destructive hover:text-destructive"

                disabled={revokingId === row.assignment_id}

                onClick={() => void revokeAssignment(row.assignment_id)}

              >

                {revokingId === row.assignment_id ? 'Revoking…' : 'Revoke'}

              </Button>

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


