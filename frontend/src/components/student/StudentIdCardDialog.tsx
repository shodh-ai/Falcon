'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, IdCard, Loader2, QrCode } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useAuthedApi } from '@/lib/api';
import { StudentAvatar } from '@/components/student/StudentAvatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/lib/notifications/falcon-toast';

type StudentIdProfile = {
  name?: string;
  enrollment_no?: string;
  email?: string;
  mobile?: string | null;
  blood_group?: string | null;
  program?: string;
  branch?: string;
  session?: string | null;
  semester?: number;
  profile_photo_url?: string | null;
  date_of_birth?: string | null;
};

type StudentIdCardDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function StudentIdCardDialog({ open, onOpenChange }: StudentIdCardDialogProps) {
  const { user } = useAuth();
  const api = useAuthedApi();
  const cardRef = useRef<HTMLDivElement>(null);
  const [profile, setProfile] = useState<StudentIdProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await api.get<StudentIdProfile>('/api/student/profile');
        if (!cancelled) setProfile(data);
      } catch {
        if (!cancelled) {
          setProfile({
            name: user?.name,
            enrollment_no: undefined,
            program: 'Program',
            semester: undefined,
          });
          toast.error('Could not load full profile — showing available details');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, api, user?.name]);

  const name = profile?.name ?? user?.name ?? 'Student';
  const enrollment = profile?.enrollment_no ?? '—';
  const program = profile?.program || profile?.branch || '—';
  const semester = profile?.semester ? `Sem ${profile.semester}` : '—';
  const session = profile?.session ?? '—';
  const blood = profile?.blood_group ?? '—';
  const mobile = profile?.mobile ?? '—';
  const initial = name.trim().charAt(0).toUpperCase() || 'S';

  const handleDownload = async () => {
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      const html2canvas = (await import('html2canvas-pro')).default;
      const { jsPDF } = await import('jspdf');
      const canvas = await html2canvas(cardRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#0B2447',
      });
      const img = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: [85.6, 53.98],
      });
      pdf.addImage(img, 'PNG', 0, 0, 85.6, 53.98);
      pdf.save(`SGVU-ID-${enrollment !== '—' ? enrollment : 'card'}.pdf`);
      toast.success('ID card downloaded');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0 sm:rounded-2xl">
        <DialogHeader className="border-b border-sgvu-navy/10 px-5 py-4 text-left">
          <DialogTitle className="flex items-center gap-2 text-sgvu-navy">
            <IdCard className="h-5 w-5 text-sgvu-gold" />
            Student ID Card
          </DialogTitle>
          <DialogDescription>
            Digital campus identity — show at gates, library, and exams. Download a PDF copy if needed.
          </DialogDescription>
        </DialogHeader>

        <div className="bg-slate-100 px-4 py-6 sm:px-6">
          {loading ? (
            <div className="flex h-48 items-center justify-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <div
              ref={cardRef}
              className="mx-auto w-full max-w-md overflow-hidden rounded-2xl border border-sgvu-gold/40 bg-gradient-to-br from-sgvu-navy via-[#0f2f5c] to-slate-900 text-white shadow-xl shadow-sgvu-navy/20"
            >
              {/* Header band */}
              <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-black/20 px-4 py-2.5">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sgvu-gold">
                    Suresh Gyan Vihar University
                  </p>
                  <p className="text-xs font-semibold text-white/80">Student Identity Card</p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sgvu-gold/20 text-xs font-black text-sgvu-gold">
                  SGVU
                </div>
              </div>

              <div className="flex gap-4 p-4">
                <div className="shrink-0">
                  <StudentAvatar
                    photoUrl={profile?.profile_photo_url}
                    name={name}
                    alt={name}
                    frameClassName="h-24 w-20 rounded-lg border-2 border-sgvu-gold/50 text-2xl shadow-md"
                    fallback={
                      <span className="flex h-full w-full items-center justify-center bg-white/10 text-2xl font-black text-sgvu-gold">
                        {initial}
                      </span>
                    }
                  />
                </div>

                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className="truncate text-lg font-black tracking-tight">{name}</p>
                  <p className="font-mono text-xs font-semibold text-sgvu-gold">{enrollment}</p>
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                    <div>
                      <p className="text-white/50">Program</p>
                      <p className="truncate font-semibold text-white/95">{program}</p>
                    </div>
                    <div>
                      <p className="text-white/50">Semester</p>
                      <p className="font-semibold text-white/95">{semester}</p>
                    </div>
                    <div>
                      <p className="text-white/50">Session</p>
                      <p className="truncate font-semibold text-white/95">{session}</p>
                    </div>
                    <div>
                      <p className="text-white/50">Blood group</p>
                      <p className="font-semibold text-white/95">{blood}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-white/10 bg-black/25 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-[10px] text-white/50">Emergency / mobile</p>
                  <p className="truncate text-xs font-semibold">{mobile}</p>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-white px-2 py-1.5 text-sgvu-navy">
                  <QrCode className="h-8 w-8" />
                  <span className="max-w-[4.5rem] break-all font-mono text-[8px] leading-tight">
                    {enrollment !== '—' ? enrollment : 'SGVU-ID'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 border-t border-sgvu-navy/10 px-5 py-4 sm:justify-between">
          <p className="text-[11px] text-muted-foreground sm:max-w-[14rem]">
            Valid for the current academic session. Contact Registrar for reprints of the physical card.
          </p>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1 sm:flex-none">
              Close
            </Button>
            <Button
              className="flex-1 bg-sgvu-navy text-white hover:bg-[#123A6D] sm:flex-none"
              onClick={() => void handleDownload()}
              disabled={loading || downloading}
            >
              {downloading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Download PDF
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
