'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { FacultyPageHeader } from '@/components/faculty/FacultyPageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import { API_URL } from '@/lib/api/client';
import { useAuth } from '@/context/AuthContext';

type ModuleRow = {
  module_id: string;
  module_number: number;
  title: string;
  description: string | null;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  materials: { material_id: string; title: string; material_type: string }[];
};

type Workspace = {
  course: { course_code: string; course_name: string; credits: number };
  modules: ModuleRow[];
  syllabus_configured: boolean;
};

export default function FacultyCourseWorkspacePage() {
  const { courseId } = useParams<{ courseId: string }>();
  const api = useAuthedApi();
  const { token } = useAuth();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [moduleCount, setModuleCount] = useState(5);
  const [moduleTitles, setModuleTitles] = useState<string[]>(['', '', '', '', '']);
  const [completeModal, setCompleteModal] = useState<ModuleRow | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [materialType, setMaterialType] = useState('NOTES');

  const load = useCallback(() => {
    if (!courseId) return;
    void api.get<Workspace>(`/api/academics/faculty/courses/${courseId}/workspace`).then(setWorkspace);
  }, [api, courseId]);

  useEffect(() => {
    load();
  }, [load]);

  async function setupSyllabus(e: FormEvent) {
    e.preventDefault();
    const modules = Array.from({ length: moduleCount }, (_, i) => ({
      module_number: i + 1,
      title: moduleTitles[i]?.trim() || `Module ${i + 1}`,
    }));
    try {
      const data = await api.post<Workspace>(`/api/academics/faculty/courses/${courseId}/syllabus`, { modules });
      setWorkspace(data);
      setSetupOpen(false);
      toast.success('Syllabus modules created');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Setup failed');
    }
  }

  async function markInProgress(moduleId: string) {
    try {
      await api.patch(`/api/academics/faculty/courses/modules/${moduleId}/status`, { status: 'IN_PROGRESS' });
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    }
  }

  async function submitComplete(e: FormEvent) {
    e.preventDefault();
    if (!completeModal || !uploadFile || !token) return;
    const form = new FormData();
    form.append('file', uploadFile);
    form.append('material_type', materialType);
    try {
      const res = await fetch(
        `${API_URL}/api/academics/faculty/courses/modules/${completeModal.module_id}/complete`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form },
      );
      if (!res.ok) throw new Error(await res.text());
      toast.success('Module completed and materials uploaded');
      setCompleteModal(null);
      setUploadFile(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    }
  }

  if (!workspace) {
    return <p className="p-8 text-center text-sm text-muted-foreground">Loading course workspace…</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <FacultyPageHeader
        title={`${workspace.course.course_code} — ${workspace.course.course_name}`}
        description="Syllabus tracker: plan modules at semester start, upload notes/PPT when each module is completed."
        actions={
          <Link href="/faculty/courses" className="text-sm font-medium text-sgvu-navy underline">
            All courses
          </Link>
        }
      />

      {!workspace.syllabus_configured || setupOpen ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Setup syllabus</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={setupSyllabus} className="space-y-3">
              <label className="text-sm">
                Number of modules
                <Input
                  type="number"
                  min={1}
                  max={20}
                  className="mt-1"
                  value={moduleCount}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setModuleCount(n);
                    setModuleTitles((prev) => {
                      const next = [...prev];
                      while (next.length < n) next.push('');
                      return next.slice(0, n);
                    });
                  }}
                />
              </label>
              {Array.from({ length: moduleCount }, (_, i) => (
                <Input
                  key={i}
                  placeholder={`Module ${i + 1} title`}
                  value={moduleTitles[i] ?? ''}
                  onChange={(e) => {
                    const next = [...moduleTitles];
                    next[i] = e.target.value;
                    setModuleTitles(next);
                  }}
                />
              ))}
              <Button type="submit">Save syllabus plan</Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setSetupOpen(true)}>
          Reconfigure syllabus
        </Button>
      )}

      <div className="space-y-3">
        {workspace.modules.map((mod) => (
          <Card key={mod.module_id}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">
                Module {mod.module_number}: {mod.title}
              </CardTitle>
              <Badge
                variant={
                  mod.status === 'COMPLETED' ? 'default' : mod.status === 'IN_PROGRESS' ? 'secondary' : 'outline'
                }
              >
                {mod.status.replace('_', ' ')}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {mod.materials.map((m) => (
                <p key={m.material_id} className="text-muted-foreground">
                  Uploaded: {m.title} ({m.material_type})
                </p>
              ))}
              {mod.status !== 'COMPLETED' && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {mod.status === 'PENDING' && (
                    <Button size="sm" variant="outline" onClick={() => void markInProgress(mod.module_id)}>
                      Mark in progress
                    </Button>
                  )}
                  <Button size="sm" onClick={() => setCompleteModal(mod)}>
                    Mark completed & upload
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {completeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-base">Upload materials — Module {completeModal.module_number}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={submitComplete} className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Upload is required before marking &quot;{completeModal.title}&quot; complete.
                </p>
                <select
                  className="w-full rounded-md border px-2 py-2 text-sm"
                  value={materialType}
                  onChange={(e) => setMaterialType(e.target.value)}
                >
                  <option value="NOTES">Notes (PDF)</option>
                  <option value="PPT">PPT / Slides</option>
                  <option value="REFERENCE">Reference</option>
                </select>
                <Input type="file" accept=".pdf,.ppt,.pptx" onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)} />
                <div className="flex gap-2">
                  <Button type="submit" disabled={!uploadFile}>
                    Complete module
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setCompleteModal(null)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
