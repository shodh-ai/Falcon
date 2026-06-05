'use client';

import { useEffect, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  FileCheck2,
  GraduationCap,
  IdCard,
  LockKeyhole,
  Mail,
  Phone,
  Send,
  ShieldCheck,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentLoadingState } from '@/components/student/StudentLoadingState';
import { StudentInfoTile } from '@/components/student/StudentInfoTile';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';

type MasterProfile = {
  student_id: string;
  enrollment_no: string;
  name: string;
  email: string;
  mobile: string | null;
  category: string | null;
  gender: string | null;
  date_of_birth: string | null;
  nationality: string;
  program: string;
  branch: string;
  session: string | null;
  semester: number;
  scholarship: unknown;
  parent_details: Record<string, unknown> | null;
  address: unknown;
  aadhaar_masked: string | null;
  passport_masked: string | null;
};

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === '') return 'Not on file';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return JSON.stringify(value);
}

function compactJsonSummary(value: unknown) {
  if (!value) return 'Not on file';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(displayValue).join(', ');
  if (typeof value === 'object') {
    return (
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== null && entry !== undefined && entry !== '')
        .map(([key, entry]) => `${key.replace(/_/g, ' ')}: ${displayValue(entry)}`)
        .join(' | ') || 'Not on file'
    );
  }
  return displayValue(value);
}

export default function StudentProfilePage() {
  const api = useAuthedApi();
  const [profile, setProfile] = useState<MasterProfile | null>(null);
  const [requestNote, setRequestNote] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api.get<MasterProfile>('/api/student/profile').then(setProfile).finally(() => setLoading(false));
  }, [api]);

  async function submitUpdateRequest() {
    if (requestNote.trim().length < 10) {
      toast.error('Describe the correction needed (10+ characters).');
      return;
    }
    try {
      await api.post('/api/student/profile/update-request', {
        subject: 'Profile master data correction',
        description: requestNote,
        fields_requested: ['name', 'mobile', 'address', 'parent_details'],
      });
      toast.success('Update request sent to Admin — your record is read-only until approved.');
      setRequestNote('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed');
    }
  }

  if (loading) return <StudentLoadingState label="Loading profile…" />;
  if (!profile) return <p className="p-8 text-center text-sm text-destructive">Profile unavailable.</p>;

  const correctionReady = requestNote.trim().length >= 10;
  const scholarship = compactJsonSummary(profile.scholarship);
  const parentDetails = compactJsonSummary(profile.parent_details);
  const address = compactJsonSummary(profile.address);

  return (
    <StudentPageShell>
      <StudentPageHeader
        title="My Profile & Master Data"
        description="Your official student identity record, secured documents, academic profile, and correction workflow in one place."
        actions={
          <Badge variant="success" className="gap-1.5 px-3 py-1">
            <ShieldCheck className="h-3.5 w-3.5" />
            Verified master record
          </Badge>
        }
      />

      <section className="overflow-hidden rounded-[2rem] border border-sgvu-navy/10 bg-gradient-to-br from-sgvu-navy via-sgvu-navy to-slate-900 text-white shadow-xl shadow-sgvu-navy/15">
        <div className="relative p-6 md:p-8">
          <div className="absolute right-0 top-0 h-56 w-56 rounded-full bg-sgvu-gold/20 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
          <div className="relative grid gap-6 lg:grid-cols-[1.3fr_0.7fr] lg:items-end">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl border border-white/20 bg-white/15 text-3xl font-black shadow-inner">
                {profile.name?.slice(0, 1).toUpperCase() ?? 'S'}
              </div>
              <div>
                <div className="mb-3 flex flex-wrap gap-2">
                  <Badge variant="secondary" className="border-white/20 bg-white/15 text-white hover:bg-white/20">
                    Semester {profile.semester}
                  </Badge>
                  <Badge variant="secondary" className="border-white/20 bg-white/15 text-white hover:bg-white/20">
                    {profile.nationality}
                  </Badge>
                </div>
                <h2 className="text-3xl font-black tracking-tight sm:text-4xl">{profile.name}</h2>
                <p className="mt-2 max-w-2xl text-sm font-medium text-white/75">
                  {profile.program} - {profile.branch}
                </p>
                <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-white/80">
                  <IdCard className="h-4 w-4 text-sgvu-gold" />
                  {profile.enrollment_no ?? profile.student_id}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/60">Session</p>
                <p className="mt-2 text-lg font-black">{profile.session ?? 'Not on file'}</p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/60">Status</p>
                <p className="mt-2 text-lg font-black text-sgvu-gold">Active</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StudentInfoTile label="Email" value={profile.email} icon={Mail} />
        <StudentInfoTile label="Mobile" value={profile.mobile} icon={Phone} />
        <StudentInfoTile label="Program / Branch" value={`${profile.program} - ${profile.branch}`} icon={GraduationCap} />
        <StudentInfoTile
          label="Gender / DOB"
          value={`${profile.gender ?? 'Not on file'} / ${profile.date_of_birth ?? 'Not on file'}`}
          icon={CalendarDays}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="overflow-hidden border-sgvu-navy/10 bg-gradient-to-b from-white to-slate-50/80 shadow-lg shadow-slate-200/60">
          <CardHeader className="border-b border-border/70 bg-white/80 pb-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sgvu-gold/20 text-sgvu-navy">
                <UserRound className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base">Academic & personal details</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">Primary information used across student services.</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <StudentInfoTile label="Category" value={profile.category} icon={FileCheck2} />
            <StudentInfoTile label="Scholarship" value={scholarship === 'Not on file' ? 'None on file' : scholarship} icon={Sparkles} />
            <div className="rounded-2xl border border-border/70 bg-white/80 p-4 shadow-sm sm:col-span-2">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Parent details</p>
              <p className="mt-2 text-sm font-medium leading-6 text-sgvu-navy">{parentDetails}</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-white/80 p-4 shadow-sm sm:col-span-2">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Address</p>
              <p className="mt-2 text-sm font-medium leading-6 text-sgvu-navy">{address}</p>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-emerald-200/70 bg-emerald-50/60 shadow-lg shadow-emerald-100/50">
            <CardHeader className="pb-4">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                  <LockKeyhole className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base text-emerald-950">Security view</CardTitle>
                  <p className="mt-1 text-sm text-emerald-800/75">Sensitive IDs stay masked and are only used for official verification.</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/80 p-3 text-sm">
                <span className="font-semibold text-emerald-950">Aadhaar</span>
                <Badge variant={profile.aadhaar_masked ? 'success' : 'warning'}>{profile.aadhaar_masked ?? 'Not on file'}</Badge>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/80 p-3 text-sm">
                <span className="font-semibold text-emerald-950">Passport</span>
                <Badge variant={profile.passport_masked ? 'success' : 'warning'}>{profile.passport_masked ?? 'Not on file'}</Badge>
              </div>
              <div className="flex gap-2 rounded-2xl border border-emerald-200 bg-white/70 p-3 text-xs leading-5 text-emerald-900">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                Correction requests are routed to Admin; direct edits are disabled to protect master data integrity.
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-sgvu-gold/30 bg-white shadow-lg shadow-slate-200/60">
            <CardHeader className="bg-gradient-to-r from-sgvu-gold/20 to-white pb-5">
              <CardTitle className="text-base">Request profile correction</CardTitle>
              <p className="text-sm text-muted-foreground">Mention the exact field and the correct value so Admin can resolve it faster.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <textarea
                className="min-h-28 w-full resize-none rounded-2xl border border-input bg-background px-4 py-3 text-sm leading-6 ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Example: Please update my mobile number to 98765xxxxx and correct my address to..."
                value={requestNote}
                onChange={(e) => setRequestNote(e.target.value)}
              />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">{requestNote.trim().length}/10 characters minimum</p>
                <Button onClick={() => void submitUpdateRequest()} disabled={!correctionReady}>
                  <Send className="h-4 w-4" />
                  Submit to Admin
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </StudentPageShell>
  );
}
