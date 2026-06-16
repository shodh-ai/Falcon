'use client';

import { useState } from 'react';
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

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

type Props = {
  drive: PlacementDrive | null;
  open: boolean;
  onClose: () => void;
  applyFn: (driveId: string, resumePath: string) => Promise<void>;
};

export function PlacementApplyModal({ drive, open, onClose, applyFn }: Props) {
  const { token } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [resumePath, setResumePath] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  async function handleUpload(file: File) {
    if (!token) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${API_URL}/uploads/single`, {
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
      setResumePath(path);
      setFileName(file.name);
      toast.success('Resume uploaded securely');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleApply() {
    if (!drive || !resumePath) {
      toast.error('Upload your resume (PDF) before applying');
      return;
    }
    setApplying(true);
    try {
      await applyFn(drive.drive_id, resumePath);
      toast.success('Application submitted!');
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
            Upload your resume (PDF) to continue. A resume is required before you can submit your application.
          </p>
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border/80 bg-muted/30 px-6 py-8 transition hover:border-sgvu-gold/50">
            <FileUp className="h-8 w-8 text-sgvu-navy/60" />
            <span className="font-medium text-sgvu-navy">
              {fileName ?? 'Upload resume (PDF) *'}
            </span>
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleUpload(file);
              }}
            />
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            className="bg-sgvu-gold text-sgvu-navy hover:bg-sgvu-gold/90"
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
