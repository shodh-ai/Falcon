'use client';

import { useEffect, useState } from 'react';
import { FileUp, Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { useAuth } from '@/context/AuthContext';
import { getSubdomainFromClient } from '@/lib/tenant';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { PlacementDrive } from '@/lib/placement';
import { getApiBaseUrl } from '@/lib/api-base-url';
import { isStudentDemoModeEnabled } from '@/lib/student-demo-mode';

const DEMO_RESUME_PATH = 'demo://resumes/Aarav_Sharma_Resume.pdf';

type Props = {
  drive: PlacementDrive | null;
  open: boolean;
  onClose: () => void;
  applyFn: (driveId: string, resumePath: string) => Promise<void>;
};

export function PlacementApplyModal({ drive, open, onClose, applyFn }: Props) {
  const { token } = useAuth();
  const demoOn = isStudentDemoModeEnabled();
  const [uploading, setUploading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [resumePath, setResumePath] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setResumePath(null);
      setFileName(null);
      setUploading(false);
      setApplying(false);
    }
  }, [open]);

  async function handleUpload(file: File) {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Please upload a PDF resume');
      return;
    }

    if (demoOn || !token) {
      setResumePath(`demo://resumes/${file.name}`);
      setFileName(file.name);
      toast.success('Resume attached');
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${getApiBaseUrl()}/uploads/single`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-tenant-subdomain': getSubdomainFromClient(),
        },
        body: form,
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { url?: string; path?: string; key?: string };
      const path = data.url ?? data.path ?? data.key ?? null;
      if (!path) throw new Error('Upload succeeded but no file path was returned');
      setResumePath(path);
      setFileName(file.name);
      toast.success('Resume uploaded securely');
    } catch (e) {
      if (demoOn) {
        setResumePath(`demo://resumes/${file.name}`);
        setFileName(file.name);
        toast.success('Resume attached (offline)');
      } else {
        toast.error(e instanceof Error ? e.message : 'Upload failed');
      }
    } finally {
      setUploading(false);
    }
  }

  function useSavedResume() {
    setResumePath(DEMO_RESUME_PATH);
    setFileName('Aarav_Sharma_Resume.pdf');
    toast.success('Using saved profile resume');
  }

  async function handleApply() {
    if (!drive || !resumePath) {
      toast.error('Upload your resume (PDF) before applying');
      return;
    }
    setApplying(true);
    try {
      await applyFn(drive.drive_id, resumePath);
      toast.success('Application submitted');
      setResumePath(null);
      setFileName(null);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Apply failed');
    } finally {
      setApplying(false);
    }
  }

  const eligibility = drive?.eligibility;

  function handleClose() {
    setResumePath(null);
    setFileName(null);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{drive?.job_role ?? 'Apply to drive'}</DialogTitle>
          <DialogDescription>
            {drive?.company_name} · ₹{Number(drive?.package_lpa ?? 0).toFixed(1)} LPA
          </DialogDescription>
        </DialogHeader>

        {eligibility && !eligibility.eligible && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {eligibility.reason}
          </div>
        )}

        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Attach a PDF resume to submit your application. You can track progress under My applications.
          </p>
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border/80 bg-muted/30 px-6 py-8 transition hover:border-sgvu-navy/40">
            <FileUp className="h-8 w-8 text-sgvu-navy/60" />
            <span className="font-medium text-sgvu-navy">
              {fileName ?? (uploading ? 'Uploading…' : 'Upload resume (PDF)')}
            </span>
            {fileName ? (
              <span className="text-xs text-emerald-700">Ready to submit</span>
            ) : null}
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              disabled={uploading || applying}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleUpload(file);
                e.target.value = '';
              }}
            />
          </label>
          {demoOn ? (
            <Button
              type="button"
              variant="outline"
              className="w-full border-sgvu-navy/20 text-sgvu-navy"
              disabled={uploading || applying}
              onClick={useSavedResume}
            >
              Use saved profile resume
            </Button>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            className="bg-sgvu-navy text-white hover:bg-[#123A6D]"
            disabled={
              eligibility?.eligible === false ||
              eligibility?.already_applied ||
              !resumePath ||
              applying ||
              uploading
            }
            onClick={() => void handleApply()}
          >
            {applying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Apply Now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
