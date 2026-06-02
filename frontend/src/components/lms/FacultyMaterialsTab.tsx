'use client';

import { FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { FacultyWorkspace } from '@/lib/api/lms';
import { postMultipart } from '@/lib/api/lms';

type Props = {
  courseId: string;
  workspace: FacultyWorkspace;
  onRefresh: () => void;
};

export function FacultyMaterialsTab({ courseId, workspace, onRefresh }: Props) {
  const api = useAuthedApi();
  const { token } = useAuth();
  const [newModuleTitle, setNewModuleTitle] = useState('');
  const [uploadModuleId, setUploadModuleId] = useState<string | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  async function addModule(e: FormEvent) {
    e.preventDefault();
    if (!newModuleTitle.trim()) return;
    try {
      await api.post(`/api/academics/faculty/courses/${courseId}/modules`, {
        title: newModuleTitle.trim(),
      });
      setNewModuleTitle('');
      toast.success('Module added');
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add module');
    }
  }

  async function submitMaterial(e: FormEvent) {
    e.preventDefault();
    if (!uploadModuleId || !uploadFile || !token) return;
    const form = new FormData();
    form.append('file', uploadFile);
    form.append('title', uploadTitle.trim() || uploadFile.name);
    form.append('material_type', 'NOTES');
    try {
      await postMultipart(
        `/api/academics/faculty/courses/modules/${uploadModuleId}/materials`,
        token,
        form,
      );
      toast.success('Material uploaded — students notified');
      setUploadModuleId(null);
      setUploadFile(null);
      setUploadTitle('');
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">+ Add Module / Unit</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={addModule} className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="e.g. Unit 1 — Introduction"
              value={newModuleTitle}
              onChange={(e) => setNewModuleTitle(e.target.value)}
            />
            <Button type="submit">Add unit</Button>
          </form>
        </CardContent>
      </Card>

      {!workspace.modules.length && (
        <p className="text-sm text-muted-foreground">
          No modules yet. Add units above, then upload PDF/PPT materials under each unit.
        </p>
      )}

      {workspace.modules.map((mod) => (
        <Card key={mod.module_id}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">
              Unit {mod.module_number}: {mod.title}
            </CardTitle>
            <Badge variant="outline">{mod.status.replace('_', ' ')}</Badge>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {mod.materials.length === 0 ? (
              <p className="text-muted-foreground">No materials uploaded for this unit.</p>
            ) : (
              <ul className="space-y-1">
                {mod.materials.map((m) => (
                  <li key={m.material_id} className="text-muted-foreground">
                    {m.title} ({m.material_type})
                  </li>
                ))}
              </ul>
            )}
            <Button size="sm" variant="outline" onClick={() => setUploadModuleId(mod.module_id)}>
              Upload material
            </Button>
          </CardContent>
        </Card>
      ))}

      {uploadModuleId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-base">Upload material</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={submitMaterial} className="space-y-3">
                <Input
                  placeholder="Title (e.g. Unit 1 Notes)"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                />
                <Input
                  type="file"
                  accept=".pdf,.ppt,.pptx,application/pdf"
                  onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                />
                <p className="text-xs text-muted-foreground">PDF or PPT · Max 10MB · Notifies enrolled students</p>
                <div className="flex gap-2">
                  <Button type="submit" disabled={!uploadFile}>
                    Upload
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setUploadModuleId(null)}>
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
