'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, Loader2, Users } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { PlacementDriveResponsesSection } from '@/components/hod/PlacementDriveResponsesSection';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { downloadAuthedFile } from '@/lib/hod-download';

type FacultyOption = { user_id: string; name: string; email: string };

type PlacementSettings = {
  dept_id: number | null;
  coordinator: { user_id: string; name: string; email: string } | null;
  faculty_options: FacultyOption[];
};

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

export function HodPlacementPanel() {
  const api = useAuthedApi();
  const { token } = useAuth();
  const [settings, setSettings] = useState<PlacementSettings | null>(null);
  const [drives, setDrives] = useState<Drive[]>([]);
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [selectedDriveId, setSelectedDriveId] = useState<string | null>(null);
  const [selectedSubmittedDate, setSelectedSubmittedDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingCoordinator, setSavingCoordinator] = useState(false);
  const [pendingCoordinatorId, setPendingCoordinatorId] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exportingAllDrives, setExportingAllDrives] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const s = await api.get<PlacementSettings>('/api/academics/hod/placement/settings');
      setSettings(s);
      setPendingCoordinatorId(s.coordinator?.user_id ?? '');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load placement settings';
      setLoadError(msg);
      toast.error(msg);
    }

    try {
      const d = await api.get<Drive[]>('/api/academics/hod/placement/drives');
      setDrives(d);
    } catch {
      setDrives([]);
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

  async function assignCoordinator(userId: string) {
    setSavingCoordinator(true);
    try {
      const s = await api.post<PlacementSettings>('/api/academics/hod/placement/coordinator', {
        coordinator_user_id: userId,
      });
      setSettings(s);
      setPendingCoordinatorId(s.coordinator?.user_id ?? '');
      toast.success('Placement coordinator updated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to assign coordinator');
    } finally {
      setSavingCoordinator(false);
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
      <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-sgvu-navy" />
          <h3 className="text-lg font-bold text-sgvu-navy">Placement Coordinator</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Assign a faculty member who will manage department drives, forms, and student registrations from their faculty portal.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[280px] flex-1">
            <label className="text-xs font-bold text-sgvu-navy uppercase tracking-wider">Coordinator</label>
            <Select
              value={pendingCoordinatorId || undefined}
              onValueChange={setPendingCoordinatorId}
              disabled={savingCoordinator || !(settings?.faculty_options?.length)}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select faculty coordinator" />
              </SelectTrigger>
              <SelectContent>
                {(settings?.faculty_options ?? []).map((f) => (
                  <SelectItem key={f.user_id} value={f.user_id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            className="bg-sgvu-navy"
            disabled={
              savingCoordinator ||
              !pendingCoordinatorId ||
              pendingCoordinatorId === settings?.coordinator?.user_id
            }
            onClick={() => void assignCoordinator(pendingCoordinatorId)}
          >
            {savingCoordinator ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Assign coordinator'}
          </Button>
          {settings?.coordinator ? (
            <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200">
              Active: {settings.coordinator.name}
            </Badge>
          ) : (
            <Badge variant="outline">No coordinator assigned</Badge>
          )}
        </div>
        {loadError ? (
          <p className="text-sm text-rose-600 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
            {loadError}. If this mentions missing tables, run backend migration{' '}
            <code className="text-xs">npm run db:migrate</code> once.
          </p>
        ) : null}
        {!settings?.dept_id ? (
          <p className="text-sm text-amber-700 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            Your HOD account is not linked to a department. Contact admin to set department on your profile.
          </p>
        ) : (settings?.faculty_options?.length ?? 0) === 0 ? (
          <p className="text-sm text-amber-700 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            No faculty found in your department roster. Add faculty under Faculty Roster &amp; Workload first.
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 flex-1">
          Drives are created and managed by the assigned placement coordinator from their faculty portal. You can monitor registrations below.
        </p>
        <Button
          variant="outline"
          className="gap-2 shrink-0"
          disabled={exportingAllDrives || drives.length === 0}
          onClick={() => void exportAllDrivesReport()}
        >
          {exportingAllDrives ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          All drives Excel
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
          <h4 className="font-bold text-sgvu-navy mb-4">Department drives</h4>
          {drives.length === 0 ? (
            <p className="text-sm text-muted-foreground">No drives yet.</p>
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
                      <p className="font-semibold text-sgvu-navy">{d.company_name}</p>
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
                      ) : null}
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
    </div>
  );
}
