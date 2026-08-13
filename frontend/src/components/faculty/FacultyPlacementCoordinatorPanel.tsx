'use client';

import { useCallback, useEffect, useState } from 'react';
import { Briefcase, Download, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PlacementDriveResponsesSection } from '@/components/hod/PlacementDriveResponsesSection';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { downloadAuthedFile } from '@/lib/hod-download';
import {
  isEmptyArray,
  isFacultyDemoEntityId,
  isFacultyDemoModeEnabled,
  isFacultyDemoSmokeId,
  withFacultyDemoFallback,
} from '@/lib/faculty-demo-mode';
import { facultyDemoPlacementDrives } from '@/lib/mock/faculty-portal-demo';

type Drive = {
  drive_id: string;
  company_name: string;
  job_role: string | null;
  drive_date: string | null;
  drive_time: string | null;
  semester: number | null;
  form_url: string | null;
  form_type: string;
  status: string;
  description: string | null;
  response_count: number;
};

type ResponseRow = {
  response_id: string;
  student_name: string;
  student_email: string | null;
  enrollment_no: string | null;
  phone: string | null;
  submitted_at: string;
};

type DriveForm = {
  company_name: string;
  job_role: string;
  drive_date: string;
  drive_time: string;
  semester: string;
  form_url: string;
  description: string;
  status: string;
};

const EMPTY_FORM: DriveForm = {
  company_name: '',
  job_role: '',
  drive_date: '',
  drive_time: '',
  semester: '7',
  form_url: '',
  description: '',
  status: 'UPCOMING',
};

function formatDriveDate(value: string | null) {
  if (!value) return '';
  return value.slice(0, 10);
}

export function FacultyPlacementCoordinatorPanel() {
  const api = useAuthedApi();
  const { token } = useAuth();
  const [drives, setDrives] = useState<Drive[]>([]);
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [selectedDriveId, setSelectedDriveId] = useState<string | null>(null);
  const [selectedSubmittedDate, setSelectedSubmittedDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [exportingAllDrives, setExportingAllDrives] = useState(false);
  const [form, setForm] = useState<DriveForm>(EMPTY_FORM);
  const [editDrive, setEditDrive] = useState<Drive | null>(null);
  const [editForm, setEditForm] = useState<DriveForm>(EMPTY_FORM);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get<Drive[]>('/api/academics/hod/placement/drives');
      setDrives(withFacultyDemoFallback(d, facultyDemoPlacementDrives() as Drive[], isEmptyArray));
    } catch (e) {
      const demo = withFacultyDemoFallback([], facultyDemoPlacementDrives() as Drive[], isEmptyArray);
      setDrives(demo);
      if (demo.length === 0) toast.error(e instanceof Error ? e.message : 'Failed to load drives');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (drives.length > 0) {
      setSelectedDriveId((prev) => prev ?? drives[0].drive_id);
    }
  }, [drives]);

  useEffect(() => {
    setSelectedSubmittedDate('');
  }, [selectedDriveId]);

  useEffect(() => {
    if (!selectedDriveId) {
      setResponses([]);
      return;
    }
    const qs = selectedSubmittedDate ? `?submitted_date=${selectedSubmittedDate}` : '';
    void api
      .get<ResponseRow[]>(`/api/academics/hod/placement/drives/${selectedDriveId}/responses${qs}`)
      .then(setResponses)
      .catch(() => setResponses([]));
  }, [api, selectedDriveId, selectedSubmittedDate]);

  async function createDrive() {
    if (!form.company_name.trim()) {
      toast.error('Company name is required');
      return;
    }
    const demoOnly =
      isFacultyDemoModeEnabled() &&
      (drives.length === 0 || drives.every((d) => isFacultyDemoEntityId(d.drive_id)));
    if (demoOnly) {
      toast.success('Drive published (demo)');
      setForm(EMPTY_FORM);
      return;
    }
    setCreating(true);
    try {
      await api.post('/api/academics/hod/placement/drives', {
        company_name: form.company_name.trim(),
        job_role: form.job_role.trim() || undefined,
        drive_date: form.drive_date || undefined,
        drive_time: form.drive_time || undefined,
        semester: Number(form.semester),
        form_url: form.form_url.trim() || undefined,
        form_type: form.form_url.trim() ? 'GOOGLE_FORM' : 'INTERNAL',
        description: form.description.trim() || undefined,
        status: form.status,
      });
      toast.success('Drive published — students can register from their portal');
      setForm(EMPTY_FORM);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create drive');
    } finally {
      setCreating(false);
    }
  }

  function openEdit(drive: Drive) {
    setEditDrive(drive);
    setEditForm({
      company_name: drive.company_name,
      job_role: drive.job_role ?? '',
      drive_date: formatDriveDate(drive.drive_date),
      drive_time: drive.drive_time ?? '',
      semester: String(drive.semester ?? 7),
      form_url: drive.form_url ?? '',
      description: drive.description ?? '',
      status: drive.status ?? 'UPCOMING',
    });
  }

  async function saveEdit() {
    if (!editDrive) return;
    if (isFacultyDemoSmokeId(editDrive.drive_id)) {
      toast.success('Drive updated (demo)');
      setEditDrive(null);
      return;
    }
    setSavingEdit(true);
    try {
      await api.patch(`/api/academics/hod/placement/drives/${editDrive.drive_id}`, {
        company_name: editForm.company_name.trim(),
        job_role: editForm.job_role.trim() || null,
        drive_date: editForm.drive_date || null,
        drive_time: editForm.drive_time || null,
        semester: Number(editForm.semester),
        form_url: editForm.form_url.trim() || null,
        form_type: editForm.form_url.trim() ? 'GOOGLE_FORM' : 'INTERNAL',
        description: editForm.description.trim() || null,
        status: editForm.status,
      });
      toast.success('Drive updated');
      setEditDrive(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update drive');
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteDrive(driveId: string) {
    if (isFacultyDemoSmokeId(driveId)) {
      toast.success('Drive deleted (demo)');
      if (selectedDriveId === driveId) setSelectedDriveId(null);
      return;
    }
    try {
      await api.del(`/api/academics/hod/placement/drives/${driveId}`);
      toast.success('Drive deleted');
      if (selectedDriveId === driveId) setSelectedDriveId(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete drive');
    }
  }

  async function exportAllDrivesReport() {
    if (!token) {
      toast.error('Please sign in to download');
      return;
    }
    setExportingAllDrives(true);
    try {
      await downloadAuthedFile(
        '/api/academics/hod/placement/registrations/export',
        token,
        'placement-all-drives-registrations.xlsx',
      );
      toast.success('All drives report downloaded');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExportingAllDrives(false);
    }
  }

  if (loading) {
    return (
      <div className="py-16 flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-sgvu-gold" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-start gap-3">
        <Briefcase className="h-5 w-5 text-emerald-700 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-emerald-900">Department Placement Coordinator</p>
          <p className="text-sm text-emerald-800/90 mt-1">
            Create upcoming drives, attach a Google Form link or use Falcon registration, and track student responses here.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm space-y-4">
        <h3 className="text-lg font-bold text-sgvu-navy">Create Placement Drive</h3>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <Input
            placeholder="Company name *"
            value={form.company_name}
            onChange={(e) => setForm({ ...form, company_name: e.target.value })}
          />
          <Input
            placeholder="Job role / position"
            value={form.job_role}
            onChange={(e) => setForm({ ...form, job_role: e.target.value })}
          />
          <Input
            type="date"
            value={form.drive_date}
            onChange={(e) => setForm({ ...form, drive_date: e.target.value })}
          />
          <Input
            type="time"
            value={form.drive_time}
            onChange={(e) => setForm({ ...form, drive_time: e.target.value })}
          />
          <Select value={form.semester} onValueChange={(v) => setForm({ ...form, semester: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Eligible semester" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5">Sem 5</SelectItem>
              <SelectItem value="6">Sem 6</SelectItem>
              <SelectItem value="7">Sem 7</SelectItem>
              <SelectItem value="8">Sem 8</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="Google Form URL (optional)"
            value={form.form_url}
            onChange={(e) => setForm({ ...form, form_url: e.target.value })}
          />
        </div>
        <Input
          placeholder="Drive notes for students (shown on student portal)"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <Button onClick={() => void createDrive()} disabled={creating} className="gap-2 bg-sgvu-navy">
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Publish drive
        </Button>
      </div>

      <div className="flex justify-end">
        <Button
          variant="outline"
          className="gap-2"
          disabled={exportingAllDrives || drives.length === 0}
          onClick={() => void exportAllDrivesReport()}
        >
          {exportingAllDrives ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Download all drives (Excel)
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
          <h4 className="font-bold text-sgvu-navy mb-4">Department drives</h4>
          {drives.length === 0 ? (
            <p className="text-sm text-muted-foreground">No drives yet. Create one above.</p>
          ) : (
            <ul className="space-y-3">
              {drives.map((d) => (
                <li
                  key={d.drive_id}
                  className={`rounded-lg border p-3 cursor-pointer transition-colors ${
                    selectedDriveId === d.drive_id ? 'border-sgvu-navy bg-slate-50' : 'border-slate-100'
                  }`}
                  onClick={() => setSelectedDriveId(d.drive_id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sgvu-navy">{d.company_name}</p>
                        <Badge variant="outline" className="text-[10px]">
                          {d.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {d.job_role || 'Role TBD'} · Sem {d.semester ?? '—'} · {d.response_count} registrations
                      </p>
                      {d.form_url ? (
                        <a
                          href={d.form_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-blue-600 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Open Google Form
                        </a>
                      ) : (
                        <p className="text-xs text-muted-foreground">Falcon registration form</p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(d);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-rose-600"
                        onClick={(e) => {
                          e.stopPropagation();
                          void deleteDrive(d.drive_id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
          <h4 className="font-bold text-sgvu-navy mb-4">Student registrations</h4>
          <PlacementDriveResponsesSection
            api={api}
            drives={drives}
            selectedDriveId={selectedDriveId}
            onSelectDriveId={setSelectedDriveId}
            selectedSubmittedDate={selectedSubmittedDate}
            onSubmittedDateChange={setSelectedSubmittedDate}
            selectedDrive={drives.find((d) => d.drive_id === selectedDriveId) ?? null}
            responses={responses}
            onResponsesChange={setResponses}
            onRegistrationAdded={() => void load()}
          />
        </div>
      </div>

      <Dialog open={!!editDrive} onOpenChange={(open) => { if (!open) setEditDrive(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit placement drive</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <Input
              placeholder="Company name"
              value={editForm.company_name}
              onChange={(e) => setEditForm({ ...editForm, company_name: e.target.value })}
            />
            <Input
              placeholder="Job role"
              value={editForm.job_role}
              onChange={(e) => setEditForm({ ...editForm, job_role: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                type="date"
                value={editForm.drive_date}
                onChange={(e) => setEditForm({ ...editForm, drive_date: e.target.value })}
              />
              <Input
                type="time"
                value={editForm.drive_time}
                onChange={(e) => setEditForm({ ...editForm, drive_time: e.target.value })}
              />
            </div>
            <Select value={editForm.semester} onValueChange={(v) => setEditForm({ ...editForm, semester: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[5, 6, 7, 8].map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    Sem {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Google Form URL"
              value={editForm.form_url}
              onChange={(e) => setEditForm({ ...editForm, form_url: e.target.value })}
            />
            <Input
              placeholder="Notes for students"
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
            />
            <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="UPCOMING">Upcoming</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDrive(null)}>
              Cancel
            </Button>
            <Button onClick={() => void saveEdit()} disabled={savingEdit} className="bg-sgvu-navy">
              {savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
