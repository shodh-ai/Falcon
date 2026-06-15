'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CalendarDays,
  CheckCircle2,
  CreditCard,
  FileCheck2,
  GraduationCap,
  IdCard,
  LockKeyhole,
  Mail,
  Pen,
  Phone,
  Send,
  ShieldCheck,
  Sparkles,
  Timer,
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
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';

type ParentDetails = {
  father_name?: string | null;
  mother_name?: string | null;
  parent_occupation?: string | null;
  annual_income?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  emergency_contact_priority?: string | null;
};

type AddressDetails = {
  permanent?: string | null;
  current?: string | null;
};

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
  parent_details: ParentDetails | null;
  address: AddressDetails | null;
  aadhaar_masked: string | null;
  passport_masked: string | null;
  profile_photo_url: string | null;
  bank_details: { bank_name?: string; account_number?: string; ifsc_code?: string } | null;
  profile_unlocked_until: string | null;
  is_profile_editable: boolean;
};

function formatCountdown(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === '') return 'Not on file';
  return String(value);
}

export default function StudentProfilePage() {
  const api = useAuthedApi();
  const [profile, setProfile] = useState<MasterProfile | null>(null);
  const [requestNote, setRequestNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [editingBank, setEditingBank] = useState(false);
  const [bankData, setBankData] = useState({ bank_name: '', account_number: '', ifsc_code: '' });
  const [parentForm, setParentForm] = useState<ParentDetails>({});
  const [addressForm, setAddressForm] = useState<AddressDetails>({});
  const [countdown, setCountdown] = useState('');
  const [isEditable, setIsEditable] = useState(false);
  const autoSavedRef = useRef(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadProfile = useCallback(async () => {
    const data = await api.get<MasterProfile>('/api/student/profile');
    setProfile(data);
    setIsEditable(data.is_profile_editable);
    if (data.bank_details) {
      setBankData({
        bank_name: data.bank_details.bank_name ?? '',
        account_number: data.bank_details.account_number ?? '',
        ifsc_code: data.bank_details.ifsc_code ?? '',
      });
    }
    if (data.parent_details) setParentForm(data.parent_details);
    if (data.address) setAddressForm(data.address);
    return data;
  }, [api]);

  useEffect(() => {
    void loadProfile().finally(() => setLoading(false));
  }, [loadProfile]);

  useEffect(() => {
    if (!profile?.profile_unlocked_until || !isEditable) {
      setCountdown('');
      return;
    }
    const tick = () => {
      const remaining = new Date(profile.profile_unlocked_until!).getTime() - Date.now();
      if (remaining <= 0) {
        setCountdown('00:00');
        setIsEditable(false);
        if (!autoSavedRef.current) {
          autoSavedRef.current = true;
          void saveProfileEdits(true);
        }
        return;
      }
      setCountdown(formatCountdown(remaining));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [profile?.profile_unlocked_until, isEditable]);

  async function saveProfileEdits(silent = false) {
    try {
      await api.patch('/api/student/profile', {
        parent_details: parentForm,
        address: addressForm,
      });
      if (!silent) toast.success('Profile changes saved and locked.');
      await loadProfile();
    } catch (e) {
      if (!silent) toast.error(e instanceof Error ? e.message : 'Save failed');
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64String = event.target?.result as string;
      try {
        await api.patch('/api/student/profile', { profile_photo_url: base64String });
        setProfile((prev) => (prev ? { ...prev, profile_photo_url: base64String } : null));
        toast.success('Profile photo updated!');
      } catch {
        toast.error('Failed to update photo');
      }
    };
    reader.readAsDataURL(file);
  }

  async function saveBankDetails() {
    try {
      await api.patch('/api/student/profile', { bank_details: bankData });
      setProfile((prev) => (prev ? { ...prev, bank_details: bankData } : null));
      setEditingBank(false);
      toast.success('Bank details saved!');
    } catch {
      toast.error('Failed to save bank details');
    }
  }

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
      toast.success('Update request sent — your record stays read-only until approved.');
      setRequestNote('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed');
    }
  }

  if (loading) return <StudentLoadingState label="Loading profile…" />;
  if (!profile) return <p className="p-8 text-center text-sm text-destructive">Profile unavailable.</p>;

  const correctionReady = requestNote.trim().length >= 10;

  return (
    <StudentPageShell>
      <StudentPageHeader
        title="My Profile & Master Data"
        description="Official Falcon identity record with time-gated correction workflow."
        actions={
          <Badge variant="success" className="gap-1.5 px-3 py-1">
            <ShieldCheck className="h-3.5 w-3.5" />
            Verified master record
          </Badge>
        }
      />

      <AnimatePresence>
        {isEditable && countdown && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sgvu-gold/40 bg-gradient-to-r from-sgvu-gold/20 to-amber-50 px-5 py-4 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <Timer className="h-5 w-5 text-sgvu-navy animate-pulse" />
              <p className="text-sm font-semibold text-sgvu-navy">
                ⏱️ You have {countdown} to make your changes.
              </p>
            </div>
            <Button size="sm" onClick={() => void saveProfileEdits()}>
              Save & lock now
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <section className="overflow-hidden rounded-[2rem] border border-sgvu-navy/10 bg-gradient-to-br from-sgvu-navy via-sgvu-navy to-slate-900 text-white shadow-xl shadow-sgvu-navy/15">
        <div className="relative p-6 md:p-8">
          <div className="absolute right-0 top-0 h-56 w-56 rounded-full bg-sgvu-gold/20 blur-3xl" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="group relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-white/20 bg-white/15 text-3xl font-black">
              {profile.profile_photo_url ? (
                <img src={profile.profile_photo_url} alt="Profile" className="h-full w-full object-cover" />
              ) : (
                profile.name?.slice(0, 1).toUpperCase() ?? 'S'
              )}
              <div
                className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() => fileInputRef.current?.click()}
              >
                <Pen className="h-5 w-5 text-white" />
              </div>
              <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={handleFileSelect} />
            </div>
            <div>
              <h2 className="text-3xl font-black tracking-tight">{profile.name}</h2>
              <p className="mt-2 text-sm text-white/75">{profile.program} — {profile.branch}</p>
              <p className="mt-2 flex items-center gap-2 text-sm text-white/80">
                <IdCard className="h-4 w-4 text-sgvu-gold" />
                {profile.enrollment_no ?? profile.student_id}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StudentInfoTile label="Email" value={profile.email} icon={Mail} />
        <StudentInfoTile label="Mobile" value={profile.mobile} icon={Phone} />
        <StudentInfoTile label="Program / Branch" value={`${profile.program} — ${profile.branch}`} icon={GraduationCap} />
        <StudentInfoTile
          label="Gender / DOB"
          value={`${profile.gender ?? 'Not on file'} / ${profile.date_of_birth ?? 'Not on file'}`}
          icon={CalendarDays}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="overflow-hidden border-sgvu-navy/10 shadow-lg">
          <CardHeader className="border-b border-border/70 bg-white/80 pb-5">
            <CardTitle className="text-base">Parent & address details</CardTitle>
            <p className="text-sm text-muted-foreground">
              {isEditable ? 'Editing enabled — save before the timer expires.' : 'Locked — request Admin approval to edit.'}
            </p>
          </CardHeader>
          <CardContent className="grid gap-4 pt-5 sm:grid-cols-2">
            {[
              { key: 'father_name', label: "Father's name" },
              { key: 'mother_name', label: "Mother's name" },
              { key: 'parent_occupation', label: "Parent's occupation" },
              { key: 'annual_income', label: 'Annual income (scholarships)' },
              { key: 'emergency_contact_name', label: 'Emergency contact' },
              { key: 'emergency_contact_phone', label: 'Emergency phone' },
              { key: 'emergency_contact_priority', label: 'Contact priority' },
            ].map(({ key, label }) => (
              <div key={key}>
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</label>
                {isEditable ? (
                  <Input
                    className="mt-2"
                    value={(parentForm as Record<string, string>)[key] ?? ''}
                    onChange={(e) => setParentForm((p) => ({ ...p, [key]: e.target.value }))}
                  />
                ) : (
                  <p className="mt-2 text-sm font-medium text-sgvu-navy">
                    {displayValue((parentForm as Record<string, unknown>)[key])}
                  </p>
                )}
              </div>
            ))}
            <div className="sm:col-span-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Permanent address</label>
              {isEditable ? (
                <textarea
                  className="mt-2 w-full rounded-lg border px-3 py-2 text-sm"
                  rows={2}
                  value={addressForm.permanent ?? ''}
                  onChange={(e) => setAddressForm((a) => ({ ...a, permanent: e.target.value }))}
                />
              ) : (
                <p className="mt-2 text-sm font-medium text-sgvu-navy">{displayValue(addressForm.permanent)}</p>
              )}
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Current address</label>
              {isEditable ? (
                <textarea
                  className="mt-2 w-full rounded-lg border px-3 py-2 text-sm"
                  rows={2}
                  value={addressForm.current ?? ''}
                  onChange={(e) => setAddressForm((a) => ({ ...a, current: e.target.value }))}
                />
              ) : (
                <p className="mt-2 text-sm font-medium text-sgvu-navy">{displayValue(addressForm.current)}</p>
              )}
            </div>
            {!isEditable && (
              <div className="sm:col-span-2 flex items-center gap-2 rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
                <LockKeyhole className="h-4 w-4" />
                Fields are locked. Submit a correction request below to unlock a 15-minute edit window.
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="overflow-hidden border-sgvu-navy/10 shadow-lg">
            <CardHeader className="border-b border-border/70 bg-slate-50/50 pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Bank details</CardTitle>
                <Button variant="outline" size="sm" onClick={() => (editingBank ? void saveBankDetails() : setEditingBank(true))}>
                  {editingBank ? 'Save' : 'Edit'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 pt-5 sm:grid-cols-2">
              {editingBank ? (
                <>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Bank name</label>
                    <Input className="mt-2" value={bankData.bank_name} onChange={(e) => setBankData({ ...bankData, bank_name: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Account number</label>
                    <Input className="mt-2" value={bankData.account_number} onChange={(e) => setBankData({ ...bankData, account_number: e.target.value })} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">IFSC</label>
                    <Input className="mt-2" value={bankData.ifsc_code} onChange={(e) => setBankData({ ...bankData, ifsc_code: e.target.value })} />
                  </div>
                </>
              ) : (
                <>
                  <StudentInfoTile label="Bank" value={profile.bank_details?.bank_name} icon={CreditCard} />
                  <StudentInfoTile label="Account" value={profile.bank_details?.account_number} icon={FileCheck2} />
                  <StudentInfoTile label="IFSC" value={profile.bank_details?.ifsc_code} icon={FileCheck2} />
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-emerald-200/70 bg-emerald-50/60">
            <CardContent className="space-y-3 pt-6">
              <div className="flex items-center justify-between rounded-2xl bg-white/80 p-3 text-sm">
                <span className="font-semibold">Aadhaar</span>
                <Badge variant={profile.aadhaar_masked ? 'success' : 'warning'}>{profile.aadhaar_masked ?? 'Not on file'}</Badge>
              </div>
              <div className="flex gap-2 rounded-2xl border border-emerald-200 bg-white/70 p-3 text-xs">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Scholarship eligibility uses annual income on file.
              </div>
            </CardContent>
          </Card>

          <Card className="border-sgvu-gold/30 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-sgvu-gold/20 to-white pb-5">
              <CardTitle className="text-base">Request profile correction</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <textarea
                className="min-h-28 w-full resize-none rounded-2xl border px-4 py-3 text-sm"
                placeholder="Describe the correction needed…"
                value={requestNote}
                onChange={(e) => setRequestNote(e.target.value)}
              />
              <Button onClick={() => void submitUpdateRequest()} disabled={!correctionReady}>
                <Send className="h-4 w-4" />
                Submit to Admin
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </StudentPageShell>
  );
}
