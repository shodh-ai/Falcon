'use client';

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StudentSectionCard } from '@/components/student/StudentSectionCard';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

export type DeptPlacementDrive = {
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
  registered: boolean;
  registered_at?: string | null;
  google_form_auto_sync?: boolean;
};

function normalizeRegistered(value: unknown): boolean {
  return value === true || value === 't' || value === 'true' || value === 1;
}

export function useStudentDeptPlacementDrives() {
  const api = useAuthedApi();
  const [drives, setDrives] = useState<DeptPlacementDrive[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await api.get<Array<DeptPlacementDrive & { registered?: unknown }>>(
        '/api/academics/student/placement/drives',
      );
      setDrives(
        rows.map((row) => ({
          ...row,
          registered: normalizeRegistered(row.registered),
          registered_at: row.registered_at ?? null,
          google_form_auto_sync: normalizeRegistered(row.google_form_auto_sync),
        })),
      );
    } catch (e) {
      setDrives([]);
      setLoadError(e instanceof Error ? e.message : 'Could not load department drives');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  return { drives, loading, loadError, reload: load };
}

export function StudentDeptDriveCard({
  drive,
  registeringId,
  onRegister,
  compact = false,
}: {
  drive: DeptPlacementDrive;
  registeringId: string | null;
  onRegister: (drive: DeptPlacementDrive, afterGoogleForm: boolean, attestation?: { formOpenedAt: number }) => void;
  compact?: boolean;
}) {
  const formStorageKey = `dept-form-opened:${drive.drive_id}`;
  const [formOpened, setFormOpened] = useState(false);
  const [attested, setAttested] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !drive.form_url) return;
    setFormOpened(Boolean(sessionStorage.getItem(formStorageKey)));
  }, [drive.drive_id, drive.form_url, formStorageKey]);

  function markFormOpened() {
    const at = Date.now();
    sessionStorage.setItem(formStorageKey, String(at));
    setFormOpened(true);
  }

  function tryConfirmAfterGoogleForm() {
    if (!formOpened) {
      toast.error('Open and submit the Google Form first, then confirm here.');
      return;
    }
    if (!attested) {
      toast.error('Check the box below to confirm you submitted the Google Form.');
      return;
    }
    const raw = sessionStorage.getItem(formStorageKey);
    onRegister(drive, true, { formOpenedAt: raw ? Number(raw) : Date.now() });
  }
  return (
    <div
      className={`rounded-2xl border border-sgvu-navy/20 bg-sgvu-navy/[0.02] p-4 space-y-3 ${
        compact ? '' : 'shadow-sm'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className="bg-sgvu-navy/10 text-sgvu-navy border border-sgvu-navy/20 text-[10px]">
              Dept drive
            </Badge>
            {drive.registered ? (
              <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200">Registered</Badge>
            ) : (
              <Badge variant="outline">{drive.status}</Badge>
            )}
          </div>
          <p className="font-semibold text-sgvu-navy mt-1">{drive.job_role || drive.company_name}</p>
          <p className="text-sm text-muted-foreground">
            {drive.company_name}
            {drive.drive_date ? ` · ${formatDriveDate(drive.drive_date)}` : ''}
            {drive.semester ? ` · Sem ${drive.semester}` : ''}
          </p>
          {drive.description ? (
            <p className="text-sm text-slate-600 mt-2">{drive.description}</p>
          ) : null}
        </div>
      </div>

      {drive.form_url ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Submit the Google Form, then confirm below so your coordinator can see your registration.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm" className="gap-2">
              <a
                href={drive.form_url}
                target="_blank"
                rel="noreferrer"
                onClick={markFormOpened}
              >
                <ExternalLink className="h-4 w-4" />
                {formOpened ? 'Re-open Google Form' : 'Step 1 — Open Google Form'}
              </a>
            </Button>
          </div>
          {!drive.registered ? (
            <>
              <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-slate-300"
                  checked={attested}
                  disabled={!formOpened}
                  onChange={(e) => setAttested(e.target.checked)}
                />
                <span>
                  I submitted the Google Form using my college email. False confirmation may lead to cancellation of
                  my registration.
                </span>
              </label>
              <Button
                size="sm"
                className="bg-sgvu-navy"
                disabled={registeringId === drive.drive_id || !formOpened || !attested}
                onClick={tryConfirmAfterGoogleForm}
              >
                {registeringId === drive.drive_id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Step 2 — Confirm registration'
                )}
              </Button>
            </>
          ) : (
            <span className="text-sm text-emerald-700 font-medium self-center">
              Confirmed — coordinator can see you.
            </span>
          )}
        </div>
      ) : drive.registered ? (
        <p className="text-sm text-emerald-700 font-medium">You are registered for this drive.</p>
      ) : (
        <Button
          size="sm"
          className="bg-sgvu-navy"
          disabled={registeringId === drive.drive_id}
          onClick={() => onRegister(drive, false)}
        >
          {registeringId === drive.drive_id ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            'Register interest'
          )}
        </Button>
      )}
    </div>
  );
}

export function StudentDeptPlacementDrives() {
  const { user } = useAuth();
  const api = useAuthedApi();
  const { drives, loading, loadError, reload } = useStudentDeptPlacementDrives();
  const [registeringId, setRegisteringId] = useState<string | null>(null);

  async function registerInternal(
    drive: DeptPlacementDrive,
    afterGoogleForm = false,
    attestation?: { formOpenedAt: number },
  ) {
    setRegisteringId(drive.drive_id);
    try {
      await api.post(`/api/academics/student/placement/drives/${drive.drive_id}/register`, {
        student_name: user?.name,
        student_email: user?.email,
        response_json: afterGoogleForm
          ? {
              source: 'GOOGLE_FORM_CONFIRMED',
              google_form_attested: true,
              form_opened_at: attestation?.formOpenedAt ?? null,
            }
          : { source: 'PORTAL' },
      });
      toast.success(
        afterGoogleForm
          ? 'Registration confirmed — your coordinator can see you in Falcon'
          : `Registered for ${drive.company_name}`,
      );
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Registration failed');
    } finally {
      setRegisteringId(null);
    }
  }

  return (
    <StudentSectionCard
      title="Department Placement Drives"
      description="From your department placement coordinator — also listed under Open positions below."
    >
      {loading ? (
        <div className="py-10 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-sgvu-gold" />
        </div>
      ) : loadError ? (
        <p className="text-sm text-rose-600 py-4">{loadError}</p>
      ) : drives.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">
          No upcoming department drives. Your coordinator will publish them here when a company visit is scheduled.
        </p>
      ) : (
        <ul className="space-y-4">
          {drives.map((drive) => (
            <li key={drive.drive_id}>
              <StudentDeptDriveCard
                drive={drive}
                registeringId={registeringId}
                onRegister={(d, after, att) => void registerInternal(d, after, att)}
              />
            </li>
          ))}
        </ul>
      )}
    </StudentSectionCard>
  );
}

function formatDriveDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
