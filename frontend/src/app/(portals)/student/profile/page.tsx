'use client';

import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  GraduationCap,
  IdCard,
  ImageIcon,
  LockKeyhole,
  Mail,
  Phone,
  Send,
  ShieldCheck,
  Sparkles,
  Timer,
  UserRound,
} from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentLoadingState } from '@/components/student/StudentLoadingState';
import { StudentInfoTile } from '@/components/student/StudentInfoTile';
import { StudentAvatar } from '@/components/student/StudentAvatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';
import { DEMO_STUDENT } from '@/lib/mock/student-portal-demo';
import { isStudentDemoModeEnabled } from '@/lib/student-demo-mode';

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

type OnboardingDocument = {
  doc_type: string;
  status: string;
  uploaded_at: string;
  admin_remarks?: string | null;
};

type MasterProfile = {
  student_id: string;
  enrollment_no: string;
  name: string;
  email: string;
  mobile: string | null;
  blood_group: string | null;
  abc_id: string | null;
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
  onboarding_status?: string;
  onboarding_documents?: OnboardingDocument[];
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

function formatDateOfBirth(value: string | null) {
  if (!value) return 'Not on file';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatGender(value: string | null) {
  if (!value) return 'Not on file';
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function formatAnnualIncome(value: string | null | undefined) {
  if (!value) return null;
  const num = Number(String(value).replace(/[^\d.]/g, ''));
  if (!Number.isNaN(num) && num > 0) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(num);
  }
  return value;
}

function hasProfileValue(value: unknown) {
  return value !== null && value !== undefined && value !== '';
}

function ProfileFieldValue({ value }: { value: unknown }) {
  const shown = hasProfileValue(value) ? String(value) : null;
  return (
    <span className={shown ? 'text-sm font-medium text-sgvu-navy' : 'text-sm text-muted-foreground'}>
      {shown ?? '—'}
    </span>
  );
}

function ProfileFieldRow({
  label,
  children,
  stacked,
}: {
  label: string;
  children: ReactNode;
  stacked?: boolean;
}) {
  if (stacked) {
    return (
      <div className="px-4 py-3">
        <span className="text-sm text-muted-foreground">{label}</span>
        <div className="mt-1.5">{children}</div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="sm:max-w-[58%] sm:text-right">{children}</div>
    </div>
  );
}

function ProfileDetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-sgvu-navy/10 bg-white">
        {children}
      </div>
    </div>
  );
}

const ONBOARDING_DOC_LABELS: Record<string, string> = {
  PHOTO: 'Passport Photo',
  AADHAAR: 'Aadhaar Card',
  '10TH_MARKSHEET': '10th Marksheet',
  '12TH_MARKSHEET': '12th Marksheet',
};

const ONBOARDING_DOC_ICONS: Record<string, typeof FileText> = {
  PHOTO: ImageIcon,
  AADHAAR: IdCard,
  '10TH_MARKSHEET': FileText,
  '12TH_MARKSHEET': FileText,
};

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

  const applyProfileState = useCallback((data: MasterProfile) => {
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
  }, []);

  const buildDemoProfile = useCallback((): MasterProfile => {
    return {
      student_id: DEMO_STUDENT.student_id,
      enrollment_no: DEMO_STUDENT.enrollment_no,
      name: DEMO_STUDENT.name,
      email: DEMO_STUDENT.email,
      mobile: DEMO_STUDENT.mobile,
      blood_group: DEMO_STUDENT.blood_group,
      abc_id: 'ABC123456789012',
      category: DEMO_STUDENT.category,
      gender: DEMO_STUDENT.gender,
      date_of_birth: '2005-04-18',
      nationality: 'Indian',
      program: DEMO_STUDENT.program,
      branch: DEMO_STUDENT.branch,
      session: DEMO_STUDENT.session,
      semester: DEMO_STUDENT.semester,
      scholarship: { name: 'Merit Scholarship', amount: 18000 },
      parent_details: {
        father_name: DEMO_STUDENT.guardian_name,
        mother_name: 'Priya Sharma',
        parent_occupation: 'Government Service',
        annual_income: '850000',
        emergency_contact_name: DEMO_STUDENT.guardian_name,
        emergency_contact_phone: '+91 98100 22334',
        emergency_contact_priority: 'Primary',
      },
      address: {
        permanent: DEMO_STUDENT.address,
        current: 'Tagore Boys Hostel — Block B, Room B-214, SGVU Main Campus, Jaipur',
      },
      aadhaar_masked: 'XXXX-XXXX-2142',
      passport_masked: null,
      profile_photo_url: DEMO_STUDENT.profile_photo_url,
      bank_details: {
        bank_name: 'State Bank of India',
        account_number: 'XXXXXXXX4521',
        ifsc_code: 'SBIN0001234',
      },
      onboarding_status: 'COMPLETED',
      onboarding_documents: [
        { doc_type: 'PHOTO', status: 'APPROVED', uploaded_at: '2023-07-12T10:00:00.000Z' },
        { doc_type: 'AADHAAR', status: 'APPROVED', uploaded_at: '2023-07-12T10:05:00.000Z' },
        { doc_type: '10TH_MARKSHEET', status: 'APPROVED', uploaded_at: '2023-07-12T10:08:00.000Z' },
        { doc_type: '12TH_MARKSHEET', status: 'APPROVED', uploaded_at: '2023-07-12T10:10:00.000Z' },
      ],
      profile_unlocked_until: null,
      is_profile_editable: false,
    };
  }, []);

  const mergeWithDemo = useCallback(
    (data: MasterProfile): MasterProfile => {
      const demo = buildDemoProfile();
      const pick = <T,>(live: T, fallback: T) =>
        live === null || live === undefined || live === '' ? fallback : live;
      return {
        ...data,
        student_id: pick(data.student_id, demo.student_id),
        enrollment_no: pick(data.enrollment_no, demo.enrollment_no),
        name: pick(data.name, demo.name),
        email: pick(data.email, demo.email),
        mobile: pick(data.mobile, demo.mobile),
        blood_group: pick(data.blood_group, demo.blood_group),
        abc_id: pick(data.abc_id, demo.abc_id),
        category: pick(data.category, demo.category),
        gender: pick(data.gender, demo.gender),
        date_of_birth: pick(data.date_of_birth, demo.date_of_birth),
        program: pick(data.program, demo.program),
        branch: pick(data.branch, demo.branch),
        session: pick(data.session, demo.session),
        semester: data.semester || demo.semester,
        parent_details: {
          father_name: pick(data.parent_details?.father_name, demo.parent_details?.father_name),
          mother_name: pick(data.parent_details?.mother_name, demo.parent_details?.mother_name),
          parent_occupation: pick(
            data.parent_details?.parent_occupation,
            demo.parent_details?.parent_occupation,
          ),
          annual_income: pick(data.parent_details?.annual_income, demo.parent_details?.annual_income),
          emergency_contact_name: pick(
            data.parent_details?.emergency_contact_name,
            demo.parent_details?.emergency_contact_name,
          ),
          emergency_contact_phone: pick(
            data.parent_details?.emergency_contact_phone,
            demo.parent_details?.emergency_contact_phone,
          ),
          emergency_contact_priority: pick(
            data.parent_details?.emergency_contact_priority,
            demo.parent_details?.emergency_contact_priority,
          ),
        },
        address: {
          permanent: pick(data.address?.permanent, demo.address?.permanent),
          current: pick(data.address?.current, demo.address?.current),
        },
        bank_details: data.bank_details?.bank_name
          ? data.bank_details
          : demo.bank_details,
        onboarding_documents:
          data.onboarding_documents && data.onboarding_documents.length > 0
            ? data.onboarding_documents
            : demo.onboarding_documents,
      };
    },
    [buildDemoProfile],
  );

  const loadProfile = useCallback(async () => {
    const data = await api.get<MasterProfile>('/api/student/profile');
    const merged = isStudentDemoModeEnabled() ? mergeWithDemo(data) : data;
    applyProfileState(merged);
    return merged;
  }, [api, applyProfileState, mergeWithDemo]);

  useEffect(() => {
    void loadProfile()
      .catch(() => {
        if (isStudentDemoModeEnabled()) {
          applyProfileState(buildDemoProfile());
        }
      })
      .finally(() => setLoading(false));
  }, [loadProfile, applyProfileState, buildDemoProfile]);

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

  async function saveBankDetails() {
    const { bank_name, account_number, ifsc_code } = bankData;

    if (!bank_name || bank_name.trim().length < 3 || !/^[A-Za-z\s&.-]+$/.test(bank_name)) {
      toast.error('Invalid Bank Name. Please enter a valid bank name.');
      return;
    }

    if (!account_number || !/^\d{9,18}$/.test(account_number)) {
      toast.error('Invalid Account Number. It must be between 9 to 18 digits.');
      return;
    }

    if (!ifsc_code || !/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(ifsc_code)) {
      toast.error('Invalid IFSC Code. Please ensure it follows the correct format (e.g., SBIN0001234).');
      return;
    }

    const uppercaseIfsc = ifsc_code.toUpperCase();
    const updatedBankData = { ...bankData, ifsc_code: uppercaseIfsc };

    try {
      await api.patch('/api/student/profile', { bank_details: updatedBankData });
      setProfile((prev) => (prev ? { ...prev, bank_details: updatedBankData } : null));
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
  const enrollmentNo = profile.enrollment_no ?? profile.student_id;

  return (
    <StudentPageShell>
      <StudentPageHeader
        title="My Profile"
        description="Your official Falcon identity — update photo anytime; master fields stay locked until a correction is approved."
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
                You have {countdown} to make your changes.
              </p>
            </div>
            <Button size="sm" onClick={() => void saveProfileEdits()}>
              Save & lock now
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <section className="overflow-hidden rounded-[1.75rem] border border-sgvu-navy/10 bg-gradient-to-br from-sgvu-navy via-[#123A6D] to-slate-900 text-white shadow-xl shadow-sgvu-navy/15">
        <div className="relative p-5 md:p-7">
          <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-sgvu-gold/20 blur-3xl" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
            <StudentAvatar
              photoUrl={profile.profile_photo_url}
              name={profile.name}
              alt="Profile"
              frameClassName="h-24 w-24 rounded-[1.35rem] border-2 border-white/25 text-3xl shadow-lg shadow-black/20 md:h-28 md:w-28"
              editable
              onPhotoUpdated={(url) =>
                setProfile((prev) =>
                  prev ? { ...prev, profile_photo_url: url } : prev,
                )
              }
            />
            <div className="min-w-0">
              <h2 className="truncate text-2xl font-black tracking-tight md:text-3xl">
                {profile.name}
              </h2>
              <p className="mt-1 text-sm text-white/75">{profile.program}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white">
                  <IdCard className="h-3.5 w-3.5 text-sgvu-gold" />
                  {enrollmentNo}
                </span>
                {profile.email ? (
                  <span className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
                    <Mail className="h-3.5 w-3.5 shrink-0 text-sgvu-gold/80" />
                    <span className="truncate">{profile.email}</span>
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StudentInfoTile label="Email" value={profile.email} icon={Mail} className="h-full" />
        <StudentInfoTile label="Mobile" value={profile.mobile} icon={Phone} className="h-full" />
        <StudentInfoTile label="Blood group" value={profile.blood_group} icon={Sparkles} className="h-full" />
        <StudentInfoTile label="ABC ID" value={profile.abc_id} icon={IdCard} className="h-full" />
        <StudentInfoTile label="Gender" value={formatGender(profile.gender)} icon={UserRound} className="h-full" />
        <StudentInfoTile label="Date of birth" value={formatDateOfBirth(profile.date_of_birth)} icon={CalendarDays} className="h-full" />
        <StudentInfoTile
          label="Session / Batch"
          value={
            isStudentDemoModeEnabled()
              ? `${profile.session ?? DEMO_STUDENT.session} · Sec ${DEMO_STUDENT.section}`
              : (profile.session ?? 'Not on file')
          }
          icon={GraduationCap}
          className="h-full"
        />
        <StudentInfoTile
          label="Semester"
          value={
            isStudentDemoModeEnabled()
              ? `Semester ${profile.semester || DEMO_STUDENT.semester} · Adm. ${DEMO_STUDENT.admission_year}`
              : `Semester ${profile.semester || '—'}`
          }
          icon={GraduationCap}
          className="h-full"
        />
      </section>

      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2 lg:items-stretch">
          <Card className="flex h-full flex-col overflow-hidden border-sgvu-navy/10 bg-white shadow-sm">
            <CardHeader className="border-b border-sgvu-navy/8 bg-white pb-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle className="text-base text-sgvu-navy">Parent & address details</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {isEditable
                      ? 'Editing enabled — save before the timer expires.'
                      : 'Submit a correction request below to unlock a 15-minute edit window.'}
                  </p>
                </div>
                {!isEditable ? (
                  <Badge variant="outline" className="shrink-0 gap-1 text-muted-foreground">
                    <LockKeyhole className="h-3 w-3" />
                    Locked
                  </Badge>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="flex-1 space-y-5 pt-5">
              <ProfileDetailSection title="Parents">
                {[
                  { key: 'father_name', label: "Father's name" },
                  { key: 'mother_name', label: "Mother's name" },
                  { key: 'parent_occupation', label: "Parent's occupation" },
                  { key: 'annual_income', label: 'Annual income (scholarships)' },
                ].map(({ key, label }) => (
                  <ProfileFieldRow key={key} label={label}>
                    {isEditable ? (
                      <Input
                        className="h-9 sm:text-right"
                        value={(parentForm as Record<string, string>)[key] ?? ''}
                        onChange={(e) => setParentForm((p) => ({ ...p, [key]: e.target.value }))}
                      />
                    ) : (
                      <ProfileFieldValue
                        value={
                          key === 'annual_income'
                            ? formatAnnualIncome((parentForm as Record<string, string>)[key])
                            : (parentForm as Record<string, unknown>)[key]
                        }
                      />
                    )}
                  </ProfileFieldRow>
                ))}
              </ProfileDetailSection>

              <ProfileDetailSection title="Emergency contact">
                {[
                  { key: 'emergency_contact_name', label: 'Contact name' },
                  { key: 'emergency_contact_phone', label: 'Phone' },
                  { key: 'emergency_contact_priority', label: 'Priority' },
                ].map(({ key, label }) => (
                  <ProfileFieldRow key={key} label={label}>
                    {isEditable ? (
                      <Input
                        className="h-9 sm:text-right"
                        value={(parentForm as Record<string, string>)[key] ?? ''}
                        onChange={(e) => setParentForm((p) => ({ ...p, [key]: e.target.value }))}
                      />
                    ) : (
                      <ProfileFieldValue value={(parentForm as Record<string, unknown>)[key]} />
                    )}
                  </ProfileFieldRow>
                ))}
              </ProfileDetailSection>

              <ProfileDetailSection title="Addresses">
                <ProfileFieldRow label="Permanent address" stacked>
                  {isEditable ? (
                    <textarea
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      rows={2}
                      value={addressForm.permanent ?? ''}
                      onChange={(e) => setAddressForm((a) => ({ ...a, permanent: e.target.value }))}
                    />
                  ) : (
                    <ProfileFieldValue value={addressForm.permanent} />
                  )}
                </ProfileFieldRow>
                <ProfileFieldRow label="Current address" stacked>
                  {isEditable ? (
                    <textarea
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      rows={2}
                      value={addressForm.current ?? ''}
                      onChange={(e) => setAddressForm((a) => ({ ...a, current: e.target.value }))}
                    />
                  ) : (
                    <ProfileFieldValue value={addressForm.current} />
                  )}
                </ProfileFieldRow>
              </ProfileDetailSection>
            </CardContent>
          </Card>

          <div className="flex h-full min-h-0 flex-col gap-6">
            <Card className="overflow-hidden border-sgvu-navy/10 bg-white shadow-sm">
              <CardHeader className="border-b border-sgvu-navy/8 bg-white pb-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base text-sgvu-navy">Bank details</CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">Used for refunds and scholarship disbursements</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => (editingBank ? void saveBankDetails() : setEditingBank(true))}>
                    {editingBank ? 'Save' : 'Edit'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-5">
                {editingBank ? (
                  <div className="grid gap-4 sm:grid-cols-2">
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
                  </div>
                ) : (
                  <ProfileDetailSection title="Bank account">
                    <ProfileFieldRow label="Bank name">
                      <ProfileFieldValue value={profile.bank_details?.bank_name} />
                    </ProfileFieldRow>
                    <ProfileFieldRow label="Account number">
                      <ProfileFieldValue value={profile.bank_details?.account_number} />
                    </ProfileFieldRow>
                    <ProfileFieldRow label="IFSC code">
                      <ProfileFieldValue value={profile.bank_details?.ifsc_code} />
                    </ProfileFieldRow>
                  </ProfileDetailSection>
                )}
              </CardContent>
            </Card>

            <Card className="flex min-h-0 flex-1 flex-col overflow-hidden border-sgvu-navy/10 bg-white shadow-sm">
              <CardHeader className="border-b border-sgvu-navy/8 bg-white pb-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sgvu-navy/5 text-sgvu-navy">
                    <ClipboardCheck className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="text-base text-sgvu-navy">Identity & documents</CardTitle>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Onboarding vault status and verified identity records
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4 pt-5">
                {(() => {
                  const docs = profile.onboarding_documents ?? [];
                  const aadhaarDoc = docs.find((d) => d.doc_type === 'AADHAAR');
                  const aadhaarOnFile = Boolean(profile.aadhaar_masked || aadhaarDoc);
                  const onboardingDone = profile.onboarding_status === 'COMPLETED';
                  const approvedCount = docs.filter((d) => d.status === 'APPROVED').length;

                  return (
                    <>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {[
                          {
                            key: 'onboarding',
                            label: 'Onboarding',
                            value: profile.onboarding_status ?? 'Not started',
                            ok: onboardingDone,
                            icon: ClipboardCheck,
                          },
                          {
                            key: 'aadhaar',
                            label: 'Aadhaar',
                            value: profile.aadhaar_masked
                              ? profile.aadhaar_masked
                              : (aadhaarDoc?.status ?? 'Not on file'),
                            ok: aadhaarOnFile,
                            icon: IdCard,
                          },
                          {
                            key: 'passport',
                            label: 'Passport',
                            value: profile.passport_masked ?? 'Not on file',
                            ok: Boolean(profile.passport_masked),
                            icon: FileText,
                          },
                          {
                            key: 'docs',
                            label: 'Documents',
                            value: docs.length ? `${approvedCount}/${docs.length} approved` : 'None on file',
                            ok: approvedCount > 0,
                            icon: ShieldCheck,
                          },
                        ].map((tile) => {
                          const Icon = tile.icon;
                          return (
                            <div
                              key={tile.key}
                              className="flex min-h-[4.75rem] items-start justify-between gap-2 rounded-2xl border border-sgvu-navy/10 bg-white p-3.5"
                            >
                              <div className="flex min-w-0 items-start gap-2.5">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sgvu-navy/5 text-sgvu-navy">
                                  <Icon className="h-4 w-4" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                                    {tile.label}
                                  </p>
                                  <p className="mt-0.5 truncate text-sm font-bold text-sgvu-navy">{tile.value}</p>
                                </div>
                              </div>
                              <Badge variant={tile.ok ? 'success' : 'warning'} className="shrink-0">
                                {tile.ok ? 'Ready' : 'Pending'}
                              </Badge>
                            </div>
                          );
                        })}
                      </div>

                      <div className="flex min-h-0 flex-1 flex-col">
                        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                          Onboarding documents
                        </h3>
                        {docs.length > 0 ? (
                          <ul className="flex flex-1 flex-col gap-2">
                            {docs.map((doc) => {
                              const DocIcon = ONBOARDING_DOC_ICONS[doc.doc_type] ?? FileText;
                              const approved = doc.status === 'APPROVED';
                              const rejected = doc.status === 'REJECTED';
                              return (
                                <li
                                  key={doc.doc_type}
                                  className="flex items-center gap-3 rounded-xl border border-sgvu-navy/10 bg-white px-3 py-3"
                                >
                                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sgvu-navy/5 text-sgvu-navy">
                                    <DocIcon className="h-4 w-4" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-semibold text-sgvu-navy">
                                      {ONBOARDING_DOC_LABELS[doc.doc_type] ?? doc.doc_type}
                                    </p>
                                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                                      {doc.uploaded_at
                                        ? `Uploaded ${new Date(doc.uploaded_at).toLocaleDateString('en-IN', {
                                            day: 'numeric',
                                            month: 'short',
                                            year: 'numeric',
                                          })}`
                                        : 'Upload date unavailable'}
                                    </p>
                                  </div>
                                  <Badge
                                    variant={
                                      approved ? 'success' : rejected ? 'destructive' : 'outline'
                                    }
                                    className="shrink-0"
                                  >
                                    {doc.status}
                                  </Badge>
                                </li>
                              );
                            })}
                            <li className="mt-auto flex items-start gap-2.5 rounded-xl border border-sgvu-navy/10 bg-white px-3.5 py-3 text-xs text-muted-foreground">
                              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sgvu-navy" />
                              <p>
                                Scholarship eligibility uses annual income on file. Keep parent income
                                and bank details current for disbursements.
                              </p>
                            </li>
                          </ul>
                        ) : (
                          <div className="flex flex-1 flex-col gap-3">
                            <div className="flex flex-1 items-start gap-3 rounded-xl border border-dashed border-sgvu-navy/15 bg-white px-4 py-5">
                              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                              <div>
                                <p className="text-sm font-semibold text-sgvu-navy">No documents on file</p>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  Passport photo and Aadhaar are collected during student onboarding.
                                </p>
                              </div>
                            </div>
                            <div className="flex items-start gap-2.5 rounded-xl border border-sgvu-navy/10 bg-white px-3.5 py-3 text-xs text-muted-foreground">
                              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sgvu-navy" />
                              <p>Scholarship eligibility uses annual income on file.</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}
              </CardContent>
            </Card>
          </div>
        </div>

        <Card className="border-sgvu-navy/10 bg-white shadow-sm">
          <CardHeader className="border-b border-sgvu-navy/8 bg-white pb-4">
            <CardTitle className="text-base text-sgvu-navy">Request profile correction</CardTitle>
            <p className="text-sm text-muted-foreground">
              Describe what needs to change. An admin can unlock a 15-minute edit window after review.
            </p>
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            <textarea
              className="min-h-28 w-full resize-none rounded-xl border px-4 py-3 text-sm"
              placeholder="Describe the correction needed…"
              value={requestNote}
              onChange={(e) => setRequestNote(e.target.value)}
            />
            <div className="flex justify-center">
              <Button
                onClick={() => void submitUpdateRequest()}
                disabled={!correctionReady}
                className="bg-[#0B2447] px-8 text-white shadow-md hover:bg-[#123A6D] hover:text-white active:bg-sgvu-gold active:text-sgvu-navy active:shadow-sm disabled:bg-[#0B2447] disabled:text-white disabled:opacity-55"
              >
                <Send className="h-4 w-4" />
                Submit to Admin
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </StudentPageShell>
  );
}
