'use client';

import { DragEvent, FormEvent, useState } from 'react';
import { BookOpen, FileText, Plus, Trash2, Upload, X } from 'lucide-react';
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
import type {
  FacultyWorkspace,
  LmsMaterial,
  MaterialPublishTargetsResponse,
} from '@/lib/api/lms';
import { postMultipart } from '@/lib/api/lms';
import { isFacultyDemoEntityId, isFacultyDemoSmokeId } from '@/lib/faculty-demo-mode';

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

function MaterialRow({
  material,
  badgeLabel,
  onDelete,
  deleting,
}: {
  material: LmsMaterial;
  badgeLabel: string;
  onDelete: (materialId: string) => void;
  deleting: string | null;
}) {
  return (
    <li className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-sm">
      <FileText className="h-4 w-4 shrink-0 text-sgvu-gold" />
      <span className="min-w-0 flex-1 truncate font-medium text-sgvu-navy">{material.title}</span>
      {material.published_sections && material.published_sections.length > 0 ? (
        <Badge variant="outline" className="shrink-0 max-w-[140px] truncate text-[10px]" title={material.published_sections.join(', ')}>
          {material.published_sections.length} section{material.published_sections.length === 1 ? '' : 's'}
        </Badge>
      ) : null}
      <Badge variant="secondary" className="shrink-0 text-[10px]">
        {badgeLabel}
      </Badge>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 shrink-0 px-2 text-muted-foreground hover:text-red-600"
        disabled={deleting === material.material_id}
        onClick={() => onDelete(material.material_id)}
        aria-label={`Delete ${material.title}`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </li>
  );
}

export function FacultyMaterialsTab({ courseId, workspace, onRefresh }: Props) {
  const api = useAuthedApi();
  const { token } = useAuth();
  const [newModuleTitle, setNewModuleTitle] = useState('');
  const [addingModule, setAddingModule] = useState(false);
  const [uploadModuleId, setUploadModuleId] = useState<string | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [syllabusFile, setSyllabusFile] = useState<File | null>(null);
  const [syllabusUploading, setSyllabusUploading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [publishTargets, setPublishTargets] = useState<MaterialPublishTargetsResponse | null>(null);
  const [selectedAllocations, setSelectedAllocations] = useState<string[]>([]);
  const [loadingTargets, setLoadingTargets] = useState(false);

  function closeUploadModal() {
    setUploadModuleId(null);
    setUploadFiles([]);
    setUploadTitle('');
    setPublishTargets(null);
    setSelectedAllocations([]);
  }

  async function openUploadModal(moduleId: string) {
    setUploadModuleId(moduleId);
    setUploadFiles([]);
    setUploadTitle('');
    setPublishTargets(null);
    setSelectedAllocations([]);
    setLoadingTargets(true);
    try {
      const data = await api.get<MaterialPublishTargetsResponse>(
        `/api/academics/faculty/courses/${courseId}/material-publish-targets`,
      );
      setPublishTargets(data);
      setSelectedAllocations(data.targets.map((target) => target.allocation_id));
    } catch {
      setPublishTargets(null);
    } finally {
      setLoadingTargets(false);
    }
  }

  async function addModule(e: FormEvent) {
    e.preventDefault();
    if (!newModuleTitle.trim()) return;
    if (isFacultyDemoEntityId(courseId)) {
      toast.success('Module added (demo)');
      setNewModuleTitle('');
      return;
    }
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
    if (!uploadModuleId || uploadFiles.length === 0 || !token) return;
    if (isFacultyDemoSmokeId(uploadModuleId) || isFacultyDemoEntityId(courseId)) {
      toast.success(
        `${uploadFiles.length} material${uploadFiles.length === 1 ? '' : 's'} uploaded (demo)`,
      );
      closeUploadModal();
      return;
    }
    const form = new FormData();
    uploadFiles.forEach((file) => form.append('files', file));
    if (uploadTitle.trim() && uploadFiles.length === 1) {
      form.append('title', uploadTitle.trim());
    }
    form.append('material_type', 'NOTES');
    if (publishTargets?.cross_section_available && selectedAllocations.length > 0) {
      form.append('allocation_ids', JSON.stringify(selectedAllocations));
    }
    setUploading(true);
    try {
      await postMultipart(
        `/api/academics/faculty/courses/modules/${uploadModuleId}/materials`,
        token,
        form,
      );
      toast.success(`${uploadFiles.length} material${uploadFiles.length === 1 ? '' : 's'} uploaded — students notified`);
      closeUploadModal();
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function deleteMaterial(materialId: string) {
    if (!confirm('Delete this file? Students will no longer be able to download it.')) return;
    if (isFacultyDemoSmokeId(materialId)) {
      toast.success('Material deleted (demo)');
      return;
    }
    setDeletingId(materialId);
    try {
      await api.del(`/api/academics/faculty/courses/materials/${materialId}`);
      toast.success('Material deleted');
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  }

  const uploadModule = workspace.modules.find((m) => m.module_id === uploadModuleId);
  const syllabusMaterials = workspace.syllabus_materials ?? [];

  function addUploadFiles(files: FileList | File[]) {
    const accepted = Array.from(files).filter((file) =>
      /\.(pdf|ppt|pptx|doc|docx)$/i.test(file.name),
    );
    setUploadFiles((prev) => [...prev, ...accepted]);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    addUploadFiles(e.dataTransfer.files);
  }

  async function uploadSyllabus() {
    if (!token || !syllabusFile) return;
    if (isFacultyDemoEntityId(courseId)) {
      toast.success('Syllabus uploaded (demo)');
      setSyllabusFile(null);
      return;
    }
    const form = new FormData();
    form.append('file', syllabusFile);
    form.append('title', 'Course Syllabus & Lesson Plan');
    setSyllabusUploading(true);
    try {
      await postMultipart(`/api/academics/faculty/courses/${courseId}/syllabus-material`, token, form);
      toast.success('Syllabus uploaded');
      setSyllabusFile(null);
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Syllabus upload failed');
    } finally {
      setSyllabusUploading(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-xl border border-sgvu-gold/35 bg-gradient-to-br from-sgvu-gold/12 via-sgvu-gold/5 to-background">
        <div className="border-b border-sgvu-gold/20 bg-sgvu-gold/10 px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sgvu-gold/25 text-sgvu-navy">
              <BookOpen className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-bold text-sgvu-navy">Course Syllabus</h2>
                <Badge variant="secondary" className="text-[10px]">
                  {syllabusMaterials.length} file{syllabusMaterials.length === 1 ? '' : 's'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Pinned at the top for all students — separate from unit notes
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          {syllabusMaterials.length === 0 ? (
            <p className="text-sm text-muted-foreground">No syllabus uploaded yet.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {syllabusMaterials.map((m) => (
                <MaterialRow
                  key={m.material_id}
                  material={m}
                  badgeLabel="SYLLABUS"
                  onDelete={(id) => void deleteMaterial(id)}
                  deleting={deletingId}
                />
              ))}
            </ul>
          )}

          <div className="flex flex-col gap-2 rounded-xl border border-dashed border-sgvu-gold/40 bg-background/80 p-3 sm:flex-row sm:items-center">
            <Input
              type="file"
              accept=".pdf,.ppt,.pptx,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="flex-1 border-0 bg-transparent file:mr-3 file:rounded-md file:border-0 file:bg-sgvu-navy/10 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-sgvu-navy"
              onChange={(e) => setSyllabusFile(e.target.files?.[0] ?? null)}
            />
            <Button
              type="button"
              className="shrink-0 gap-1.5 sm:w-auto"
              disabled={!syllabusFile || syllabusUploading}
              onClick={() => void uploadSyllabus()}
            >
              <Upload className="h-4 w-4" />
              {syllabusUploading ? 'Uploading…' : 'Upload syllabus'}
            </Button>
          </div>
        </div>
      </section>

      <FacultyPanel
        title="Unit notes & materials"
        description="Organize notes and slides by unit"
        count={workspace.modules.length}
      >
          <form onSubmit={addModule} className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
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

          {workspace.modules.length === 0 ? (
            <FacultyEmptyState
              title="No units yet"
              description="Add your first unit above, then upload PDF, PPT, or Word notes for enrolled students."
            />
          ) : (
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
                      <p className="text-sm text-muted-foreground">No notes uploaded for this unit.</p>
                    ) : (
                      <ul className="space-y-2">
                        {mod.materials.map((m) => (
                          <MaterialRow
                            key={m.material_id}
                            material={m}
                            badgeLabel={m.material_type}
                            onDelete={(id) => void deleteMaterial(id)}
                            deleting={deletingId}
                          />
                        ))}
                      </ul>
                    )}
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3 gap-1.5"
                    onClick={() => void openUploadModal(mod.module_id)}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Upload notes
                  </Button>
                </div>
              ))}
            </div>
          )}
        </FacultyPanel>

      {uploadModuleId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-xl border border-border/60 bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border/50 bg-muted/30 px-5 py-4">
              <div>
                <p className="text-sm font-bold text-sgvu-navy">Upload notes</p>
                {uploadModule ? (
                  <p className="text-xs text-muted-foreground">
                    Unit {uploadModule.module_number}: {uploadModule.title}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={closeUploadModal}
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
                <p className="text-xs text-muted-foreground">
                  Used only for a single file. Multiple files keep their filenames as titles.
                </p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Files</label>
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm transition hover:border-sgvu-gold/60 hover:bg-sgvu-gold/5"
                >
                  <Upload className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
                  <p className="font-medium text-sgvu-navy">Drag PDFs, PPTs, or Word docs here, or select below</p>
                  <p className="mt-1 text-xs text-muted-foreground">Multiple files · Max 10MB each</p>
                </div>
                <Input
                  type="file"
                  multiple
                  accept=".pdf,.ppt,.pptx,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(e) => {
                    if (e.target.files) addUploadFiles(e.target.files);
                  }}
                />
                {uploadFiles.length > 0 ? (
                  <ul className="space-y-1 rounded-lg bg-muted/30 p-2 text-xs">
                    {uploadFiles.map((file) => (
                      <li key={`${file.name}-${file.size}`} className="flex items-center justify-between gap-2">
                        <span className="truncate">{file.name}</span>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-red-600"
                          onClick={() => setUploadFiles((prev) => prev.filter((f) => f !== file))}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  PDF, PPT, or Word doc · Max 10MB · Notifies enrolled students
                </p>
              </div>
              {publishTargets?.cross_section_available ? (
                <div className="space-y-2 rounded-xl border border-sgvu-gold/30 bg-sgvu-gold/5 p-3">
                  <p className="text-xs font-semibold text-sgvu-navy">
                    You teach {publishTargets.course.course_name} to multiple sections. Where should these notes appear?
                  </p>
                  {loadingTargets ? (
                    <p className="text-xs text-muted-foreground">Loading sections…</p>
                  ) : (
                    <ul className="space-y-2">
                      {publishTargets.targets.map((target) => {
                        const checked = selectedAllocations.includes(target.allocation_id);
                        return (
                          <li key={target.allocation_id} className="flex items-start gap-2">
                            <input
                              id={`alloc-${target.allocation_id}`}
                              type="checkbox"
                              checked={checked}
                              className="mt-0.5 h-4 w-4 rounded border-border accent-sgvu-navy"
                              onChange={(e) => {
                                setSelectedAllocations((prev) =>
                                  e.target.checked
                                    ? [...prev, target.allocation_id]
                                    : prev.filter((id) => id !== target.allocation_id),
                                );
                              }}
                            />
                            <label
                              htmlFor={`alloc-${target.allocation_id}`}
                              className="cursor-pointer text-xs leading-relaxed text-sgvu-navy"
                            >
                              {target.program_name ?? 'Program'} ({target.semester ?? 'Section'})
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    One upload is stored once and published to every checked section.
                  </p>
                </div>
              ) : null}
              <div className="flex gap-2 pt-1">
                <Button
                  type="submit"
                  disabled={
                    uploadFiles.length === 0
                    || uploading
                    || (publishTargets?.cross_section_available === true && selectedAllocations.length === 0)
                  }
                  className="gap-1.5"
                >
                  <Upload className="h-4 w-4" />
                  {uploading ? 'Uploading…' : `Upload ${uploadFiles.length || ''}`}
                </Button>
                <Button type="button" variant="outline" onClick={closeUploadModal}>
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
