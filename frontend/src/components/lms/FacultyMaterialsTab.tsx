'use client';

import { FormEvent, useState } from 'react';
import { FileText, Plus, Upload, X } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { cn } from '@/lib/utils';
import {
  FacultyPanel,
  FacultyEmptyState,
} from '@/components/faculty';
import { Button } from '@/components/ui/button';
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

function moduleStatusBadge(status: string) {
  const normalized = status.replace(/_/g, ' ');
  const isComplete = status === 'COMPLETED' || status === 'COMPLETE';
  return (
    <Badge
      variant="outline"
      className={cn(
        'text-[10px] font-semibold uppercase tracking-wide',
        isComplete
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-border bg-muted/50 text-muted-foreground',
      )}
    >
      {normalized}
    </Badge>
  );
}

export function FacultyMaterialsTab({ courseId, workspace, onRefresh }: Props) {
  const api = useAuthedApi();
  const { token } = useAuth();
  const [newModuleTitle, setNewModuleTitle] = useState('');
  const [addingModule, setAddingModule] = useState(false);
  const [uploadModuleId, setUploadModuleId] = useState<string | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  async function addModule(e: FormEvent) {
    e.preventDefault();
    if (!newModuleTitle.trim()) return;
    setAddingModule(true);
    try {
      await api.post(`/api/academics/faculty/courses/${courseId}/modules`, {
        title: newModuleTitle.trim(),
      });
      setNewModuleTitle('');
      toast.success('Module added');
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add module');
    } finally {
      setAddingModule(false);
    }
  }

  async function submitMaterial(e: FormEvent) {
    e.preventDefault();
    if (!uploadModuleId || !uploadFile || !token) return;
    const form = new FormData();
    form.append('file', uploadFile);
    form.append('title', uploadTitle.trim() || uploadFile.name);
    form.append('material_type', 'NOTES');
    setUploading(true);
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
    } finally {
      setUploading(false);
    }
  }

  const uploadModule = workspace.modules.find((m) => m.module_id === uploadModuleId);

  return (
    <div className="space-y-4">
      <FacultyPanel
        title="Add module / unit"
        description="Organize the syllabus into units, then upload notes or slides under each one"
      >
        <form onSubmit={addModule} className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            placeholder="e.g. Unit 1 — Introduction"
            value={newModuleTitle}
            onChange={(e) => setNewModuleTitle(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" disabled={addingModule || !newModuleTitle.trim()} className="shrink-0 gap-1.5">
            <Plus className="h-4 w-4" />
            Add unit
          </Button>
        </form>
      </FacultyPanel>

      {workspace.modules.length === 0 ? (
        <FacultyEmptyState
          title="No units yet"
          description="Add your first module above, then upload PDF or PPT materials for enrolled students."
        />
      ) : (
        <FacultyPanel
          title="Syllabus units"
          count={workspace.modules.length}
          description="Reference materials grouped by unit"
        >
          <div className="space-y-3">
            {workspace.modules.map((mod) => (
              <div
                key={mod.module_id}
                className="rounded-xl border border-border/60 bg-background p-4 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-sgvu-navy/10 px-2 py-0.5 text-xs font-bold text-sgvu-navy">
                        Unit {mod.module_number}
                      </span>
                      <h3 className="font-semibold text-sgvu-navy">{mod.title}</h3>
                    </div>
                    {mod.description ? (
                      <p className="mt-1 text-sm text-muted-foreground">{mod.description}</p>
                    ) : null}
                  </div>
                  {moduleStatusBadge(mod.status)}
                </div>

                <div className="mt-3">
                  {mod.materials.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No materials uploaded for this unit.</p>
                  ) : (
                    <ul className="space-y-2">
                      {mod.materials.map((m) => (
                        <li
                          key={m.material_id}
                          className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-sm"
                        >
                          <FileText className="h-4 w-4 shrink-0 text-sgvu-gold" />
                          <span className="font-medium text-sgvu-navy">{m.title}</span>
                          <Badge variant="secondary" className="ml-auto text-[10px]">
                            {m.material_type}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3 gap-1.5"
                  onClick={() => setUploadModuleId(mod.module_id)}
                >
                  <Upload className="h-3.5 w-3.5" />
                  Upload material
                </Button>
              </div>
            ))}
          </div>
        </FacultyPanel>
      )}

      {uploadModuleId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-xl border border-border/60 bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border/50 bg-muted/30 px-5 py-4">
              <div>
                <p className="text-sm font-bold text-sgvu-navy">Upload material</p>
                {uploadModule ? (
                  <p className="text-xs text-muted-foreground">
                    Unit {uploadModule.module_number}: {uploadModule.title}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setUploadModuleId(null)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-sgvu-navy"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={submitMaterial} className="space-y-4 p-5">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Title</label>
                <Input
                  placeholder="e.g. Unit 1 Notes"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">File</label>
                <Input
                  type="file"
                  accept=".pdf,.ppt,.pptx,application/pdf"
                  onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                />
                <p className="text-xs text-muted-foreground">
                  PDF or PPT · Max 10MB · Notifies enrolled students
                </p>
              </div>
              <div className="flex gap-2 pt-1">
                <Button type="submit" disabled={!uploadFile || uploading} className="gap-1.5">
                  <Upload className="h-4 w-4" />
                  {uploading ? 'Uploading…' : 'Upload'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setUploadModuleId(null)}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
