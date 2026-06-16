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

export default function SuperAdminHierarchyPage() {
  const api = useAuthedApi();
  const [tree, setTree] = useState<Hierarchy | null>(null);
  const [sectionName, setSectionName] = useState('Section A');
  const [assignUserId, setAssignUserId] = useState('');
  const [entityId, setEntityId] = useState('');
  const [studentIds, setStudentIds] = useState('');
  const [sectionId, setSectionId] = useState('');

  const load = () => void api.get<Hierarchy>('/api/super-admin/hierarchy').then(setTree);

  useEffect(() => {
    load();
  }, [api]);

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
    try {
      await api.post('/api/super-admin/assignments', {
        user_id: assignUserId,
        assignment_type: 'DEAN',
        entity_type: 'SCHOOL',
        entity_id: entityId,
      });
      toast.success('Dean assigned');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  }

  async function bulkAssign() {
    try {
      const ids = studentIds.split(',').map((s) => s.trim()).filter(Boolean);
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
          <Input placeholder="Dean user UUID" value={assignUserId} onChange={(e) => setAssignUserId(e.target.value)} />
          <Input placeholder="School ID" value={entityId} onChange={(e) => setEntityId(e.target.value)} />
          <Button variant="outline" onClick={() => void assignDean()}>Assign dean to school</Button>
          <Input placeholder="Section UUID" value={sectionId} onChange={(e) => setSectionId(e.target.value)} />
          <Input placeholder="Student UUIDs (comma-separated)" value={studentIds} onChange={(e) => setStudentIds(e.target.value)} />
          <Button onClick={() => void bulkAssign()}>Bulk assign to section</Button>
        </CardContent>
      </Card>
    </div>
  );
}
