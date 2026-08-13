'use client';

import { Select } from '@/components/ui/select';
import { FormEvent, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  BookOpen,
  Briefcase,
  Camera,
  Eye,
  EyeOff,
  FlaskConical,
  FolderLock,
  GraduationCap,
  IdCard,
  LockKeyhole,
  Mail,
  Phone,
  Plus,
  Save,
  Shield,
  UserRound,
} from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { cn } from '@/lib/utils';
import {
  FacultyPageHeader,
  FacultyPageShell,
  FacultyPageLoading,
  FacultyPanel,
  FacultyStatCard,
  FacultyTabBar,
  FacultyEmptyState,
  FacultyErrorBanner,
} from '@/components/faculty';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MyDocumentsPanel } from '@/components/self-service/MyDocumentsPanel';
import { useAuth } from '@/context/AuthContext';
import { withFacultyDemoFallback } from '@/lib/faculty-demo-mode';
import { FACULTY_DEMO_PROFILE } from '@/lib/mock/faculty-portal-demo';
import { useAuthedApi } from '@/lib/api';
import { getSubdomainFromClient } from '@/lib/tenant';

type ProfileTab = 'overview' | 'personal' | 'qualifications' | 'research' | 'workload' | 'documents';

type Qualification = {
  qual_id: string;
  degree_level: string | null;
  degree_name: string | null;
  university: string;
  passing_year: number;
  specialization: string | null;
  document_proof_url: string | null;
};

type FacultyProfile = {
  user_id: string;
  name: string;
  display_name: string;
  honorific: string | null;
  email: string;
  phone: string | null;
  role: string;
  department: string | null;
  employee_id: string | null;
  designation: string;
  joining_date: string | null;
  profile_photo_url: string | null;
  total_teaching_experience_years: number | null;
  industry_experience_years: number;
  api_score: number;
  active_mentees: number;
  responsibilities: Array<{ title: string; description?: string | null; source?: string }>;
  personal: {
    date_of_birth: string | null;
    blood_group: string | null;
    gender: string | null;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
    permanent_address: string | null;
    current_address: string | null;
  };
  kyc: {
    pan_masked: string | null;
    aadhaar_masked: string | null;
    bank_masked: string | null;
    ifsc_code: string | null;
    pf_uan: string | null;
  };
  research_identifiers: {
    orcid_id: string | null;
    scopus_id: string | null;
    google_scholar_url: string | null;
  };
  research_summary: {
    total_scopus_papers: number;
    total_patents: number;
    total_conference_papers: number;
    total_books: number;
    total_publications: number;
    total_grants_inr: number;
    total_grants_display: string;
  };
  qualifications: Qualification[];
  workload: {
    courses: Array<{
      course_id: string;
      course_code: string;
      course_name: string;
      credits: number;
      session_type: string;
    }>;
    weekly_teaching_hours: number;
    project_guides_count: number;
    project_guides: Array<{
      guide_id: string;
      project_title: string | null;
      project_type: string | null;
      student_name: string;
    }>;
    phd_scholars_count: number;
    phd_scholars: Array<{ scholar_id: string; current_phase: string; scholar_name: string }>;
  };
  bank_change_pending: { request_id: string; status: string; created_at: string } | null;
};

type KycRevealed = {
  pan?: string;
  aadhaar?: string;
  bank_account?: string;
  ifsc_code?: string;
  pf_uan?: string;
};

const TABS: { id: ProfileTab; label: string; icon: typeof UserRound }[] = [
  { id: 'overview', label: 'Overview', icon: UserRound },
  { id: 'personal', label: 'Personal & KYC', icon: LockKeyhole },
  { id: 'qualifications', label: 'Qualifications', icon: GraduationCap },
  { id: 'research', label: 'Research & IQAC', icon: FlaskConical },
  { id: 'workload', label: 'Workload', icon: BookOpen },
  { id: 'documents', label: 'Documents', icon: FolderLock },
];

const DEGREE_LEVELS = ['UG', 'PG', 'PhD', 'Post-Doc'];

const LEVEL_COLORS: Record<string, string> = {
  UG: 'bg-slate-100 text-slate-700 border-slate-200',
  PG: 'bg-blue-50 text-blue-800 border-blue-200',
  PhD: 'bg-sgvu-navy/10 text-sgvu-navy border-sgvu-navy/20',
  'Post-Doc': 'bg-sgvu-gold/15 text-sgvu-navy border-sgvu-gold/40',
};

function FieldRow({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  const shown = value?.trim();
  return (
    <div className="grid gap-1 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:items-center sm:gap-6">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={cn(
          'text-sm sm:text-right',
          shown ? 'font-medium text-sgvu-navy' : 'text-muted-foreground/80',
          mono && shown && 'font-mono text-xs tracking-wide',
        )}
      >
        {shown ?? '—'}
      </span>
    </div>
  );
}

function SectionList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'divide-y divide-border/50 overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm',
        className,
      )}
    >
      {children}
    </div>
  );
}

function FormField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</label>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function FacultyProfileAvatar({
  name,
  photoUrl,
  onPhotoUpdated,
}: {
  name: string;
  photoUrl: string | null;
  onPhotoUpdated: (url: string | null) => void;
}) {
  const api = useAuthedApi();
  const { token } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!photoUrl || !token) {
      setSrc(null);
      return;
    }
    if (photoUrl.startsWith('data:') || photoUrl.startsWith('blob:')) {
      setSrc(photoUrl);
      return;
    }

    let objectUrl: string | null = null;
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    const fetchUrl = photoUrl.startsWith('http') ? photoUrl : `${apiBase}${photoUrl}`;

    void fetch(fetchUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-tenant-subdomain': getSubdomainFromClient(),
      },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Photo load failed');
        return res.blob();
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => setSrc(null));

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photoUrl, token]);

  async function handleFileSelect(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose a JPG, PNG, or WEBP photo');
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const updated = await api.post<FacultyProfile>('/api/academics/faculty/profile/photo', form);
      onPhotoUpdated(updated.profile_photo_url);
      toast.success('Profile photo updated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to upload photo', { category: 'HR' });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="group relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-white/25 bg-white/10 text-3xl font-black shadow-inner">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        name.slice(0, 1).toUpperCase()
      )}
      <button
        type="button"
        className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
      >
        <Camera className="h-5 w-5" />
        <span className="text-[10px] font-semibold uppercase tracking-wide">
          {uploading ? 'Uploading…' : src ? 'Change' : 'Upload'}
        </span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFileSelect(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}

function ProfileHero({
  profile,
  onPhotoUpdated,
}: {
  profile: FacultyProfile;
  onPhotoUpdated: (url: string | null) => void;
}) {
  return (
    <section
      className="overflow-hidden rounded-2xl border border-sgvu-navy/10 bg-gradient-to-br from-sgvu-navy via-sgvu-navy to-slate-900 text-white shadow-lg shadow-sgvu-navy/20"
    >
      <div className="relative p-5 sm:p-6">
        <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-sgvu-gold/20 blur-3xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
          <FacultyProfileAvatar
            name={profile.name}
            photoUrl={profile.profile_photo_url}
            onPhotoUpdated={onPhotoUpdated}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {profile.honorific ? (
                <Badge className="border-white/20 bg-white/15 text-white hover:bg-white/20">{profile.honorific}</Badge>
              ) : null}
              <Badge className="border-sgvu-gold/40 bg-sgvu-gold/25 text-white">{profile.role}</Badge>
            </div>
            <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">{profile.display_name}</h2>
            <p className="mt-1 text-sm text-white/80">{profile.designation}</p>
            <p className="text-sm text-white/70">{profile.department ?? 'Department not assigned'}</p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/75">
              <span className="inline-flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-sgvu-gold" />
                {profile.email}
              </span>
              {profile.phone ? (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-sgvu-gold" />
                  {profile.phone}
                </span>
              ) : null}
              {profile.employee_id ? (
                <span className="inline-flex items-center gap-1.5">
                  <IdCard className="h-3.5 w-3.5 text-sgvu-gold" />
                  {profile.employee_id}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function QualificationTimeline({ items }: { items: Qualification[] }) {
  return (
    <div className="space-y-3">
      {items.map((q) => (
        <div
          key={q.qual_id}
          className="flex gap-4 rounded-xl border border-border/60 bg-gradient-to-r from-card to-muted/20 p-4 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="flex shrink-0 flex-col items-center">
            <span
              className={cn(
                'flex h-11 w-11 items-center justify-center rounded-xl border text-xs font-bold tabular-nums',
                LEVEL_COLORS[q.degree_level ?? 'PG'] ?? 'bg-muted text-sgvu-navy border-border',
              )}
            >
              {q.passing_year}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {q.degree_level ? (
                <Badge variant="outline" className="text-[10px] font-bold uppercase">{q.degree_level}</Badge>
              ) : null}
              {q.document_proof_url ? <Badge variant="success" className="text-[10px]">Verified doc</Badge> : null}
            </div>
            <p className="mt-1 font-semibold text-sgvu-navy">{q.degree_name ?? 'Degree'}</p>
            <p className="text-sm text-muted-foreground">{q.university}</p>
            {q.specialization ? (
              <p className="mt-1 text-xs text-muted-foreground">{q.specialization}</p>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function FacultyProfilePage() {
  const api = useAuthedApi();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<ProfileTab>('overview');
  const [profile, setProfile] = useState<FacultyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [kycRevealed, setKycRevealed] = useState<KycRevealed | null>(null);
  const [revealPassword, setRevealPassword] = useState('');
  const [revealing, setRevealing] = useState(false);

  const [personalForm, setPersonalForm] = useState({
    emergency_contact_name: '',
    emergency_contact_phone: '',
    permanent_address: '',
    current_address: '',
  });
  const [researchForm, setResearchForm] = useState({
    orcid_id: '',
    scopus_id: '',
    google_scholar_url: '',
    total_experience_years: '',
    industry_experience_years: '',
  });
  const [bankForm, setBankForm] = useState({ bank_account_no: '', ifsc_code: '', bank_name: '' });

  const [qualForm, setQualForm] = useState({
    degree_level: 'PG',
    degree_name: '',
    university: '',
    passing_year: String(new Date().getFullYear()),
    specialization: '',
  });
  const [qualFile, setQualFile] = useState<File | null>(null);
  const [addingQual, setAddingQual] = useState(false);

  const applyProfile = useCallback((data: FacultyProfile) => {
    setProfile(data);
    setPersonalForm({
      emergency_contact_name: data.personal.emergency_contact_name ?? '',
      emergency_contact_phone: data.personal.emergency_contact_phone ?? '',
      permanent_address: data.personal.permanent_address ?? '',
      current_address: data.personal.current_address ?? '',
    });
    setResearchForm({
      orcid_id: data.research_identifiers.orcid_id ?? '',
      scopus_id: data.research_identifiers.scopus_id ?? '',
      google_scholar_url: data.research_identifiers.google_scholar_url ?? '',
      total_experience_years: data.total_teaching_experience_years != null
        ? String(data.total_teaching_experience_years)
        : '',
      industry_experience_years: String(data.industry_experience_years ?? 0),
    });
  }, []);

  const loadProfile = useCallback(async () => {
    try {
      const data = await api.get<FacultyProfile>('/api/academics/faculty/profile');
      const resolved = withFacultyDemoFallback(
        data,
        FACULTY_DEMO_PROFILE() as unknown as FacultyProfile,
      );
      applyProfile(resolved);
      return resolved;
    } catch (e) {
      const demo = withFacultyDemoFallback(
        null,
        FACULTY_DEMO_PROFILE() as unknown as FacultyProfile,
      );
      if (demo) {
        applyProfile(demo);
        return demo;
      }
      throw e;
    }
  }, [api, applyProfile]);

  useEffect(() => {
    const t = searchParams.get('tab');
    if (
      t === 'overview' ||
      t === 'personal' ||
      t === 'qualifications' ||
      t === 'research' ||
      t === 'workload' ||
      t === 'documents'
    ) {
      setTab(t);
    }
  }, [searchParams]);

  useEffect(() => {
    void loadProfile()
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load profile'))
      .finally(() => setLoading(false));
  }, [loadProfile]);

  async function savePersonal() {
    setSaving(true);
    try {
      const updated = await api.patch<FacultyProfile>('/api/academics/faculty/profile', personalForm);
      setProfile(updated);
      toast.success('Contact and address details saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function saveResearch() {
    setSaving(true);
    try {
      const updated = await api.patch<FacultyProfile>('/api/academics/faculty/profile', {
        orcid_id: researchForm.orcid_id,
        scopus_id: researchForm.scopus_id,
        google_scholar_url: researchForm.google_scholar_url,
        total_experience_years: researchForm.total_experience_years
          ? Number(researchForm.total_experience_years)
          : undefined,
        industry_experience_years: Number(researchForm.industry_experience_years || 0),
      });
      setProfile(updated);
      toast.success('Research profile updated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function revealKyc() {
    if (!revealPassword) {
      toast.error('Enter your password to reveal KYC data');
      return;
    }
    setRevealing(true);
    try {
      const data = await api.post<FacultyProfile & { kyc_revealed?: KycRevealed }>(
        '/api/academics/faculty/profile/kyc/reveal',
        { password: revealPassword },
      );
      setKycRevealed(data.kyc_revealed ?? null);
      setRevealPassword('');
      toast.success('KYC data revealed — do not share this screen');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Password verification failed');
    } finally {
      setRevealing(false);
    }
  }

  async function submitBankChange(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/api/academics/faculty/profile/bank-change-request', bankForm);
      toast.success('Bank change submitted for HR approval');
      setBankForm({ bank_account_no: '', ifsc_code: '', bank_name: '' });
      await loadProfile();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setSaving(false);
    }
  }

  async function addQualification(e: FormEvent) {
    e.preventDefault();
    if (!qualForm.university.trim()) {
      toast.error('University is required');
      return;
    }
    setAddingQual(true);
    try {
      const formData = new FormData();
      formData.append('degree_level', qualForm.degree_level);
      formData.append('degree_name', qualForm.degree_name);
      formData.append('university', qualForm.university);
      formData.append('passing_year', qualForm.passing_year);
      formData.append('specialization', qualForm.specialization);
      if (qualFile) formData.append('document', qualFile);

      await api.post('/api/academics/faculty/profile/qualifications', formData);
      toast.success('Qualification added');
      setQualForm({
        degree_level: 'PG',
        degree_name: '',
        university: '',
        passing_year: String(new Date().getFullYear()),
        specialization: '',
      });
      setQualFile(null);
      await loadProfile();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add qualification');
    } finally {
      setAddingQual(false);
    }
  }

  if (loading) return <FacultyPageLoading label="Loading faculty profile…" branded />;
  if (error || !profile) {
    return (
      <FacultyPageShell>
        <FacultyErrorBanner message={error ?? 'Profile unavailable'} />
      </FacultyPageShell>
    );
  }

  return (
    <FacultyPageShell>
      <FacultyPageHeader
        title="My Profile"
        description="NAAC-compliant master record — identity, qualifications, research identifiers, and workload."
        actions={
          <Badge variant="outline" className="gap-1.5 border-sgvu-gold/40 bg-sgvu-gold/10 text-sgvu-navy">
            <Shield className="h-3.5 w-3.5" />
            IQAC master record
          </Badge>
        }
      />

      <ProfileHero
        profile={profile}
        onPhotoUpdated={(url) => setProfile((prev) => (prev ? { ...prev, profile_photo_url: url } : prev))}
      />

      <FacultyTabBar tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'overview' && (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <FacultyStatCard
              label="Teaching experience"
              value={profile.total_teaching_experience_years ?? '—'}
              sub="years on record"
              icon={Briefcase}
            />
            <FacultyStatCard
              label="Current API score"
              value={profile.api_score}
              sub="PMS auto-score"
              icon={GraduationCap}
              accent="gold"
            />
            <FacultyStatCard label="Active mentees" value={profile.active_mentees} icon={UserRound} />
          </div>

          <FacultyPanel title="Current responsibilities" description="Roles and duties assigned by HR">
            {profile.responsibilities.length ? (
              <ul className="grid gap-2 sm:grid-cols-2">
                {profile.responsibilities.map((r) => (
                  <li
                    key={r.title}
                    className="flex items-start gap-3 rounded-xl border border-border/50 bg-gradient-to-br from-card to-muted/30 px-4 py-3.5 shadow-sm"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sgvu-navy/8 text-sgvu-navy">
                      <Briefcase className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-sgvu-navy">{r.title}</p>
                      {r.description ? <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{r.description}</p> : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <FacultyEmptyState title="No responsibilities on file" description="HR can assign duties via the directory portal." />
            )}
          </FacultyPanel>

          <FacultyPanel title="HR-locked fields" description="Only HR can change these via the directory portal">
            <SectionList>
              <FieldRow label="Designation" value={profile.designation} />
              <FieldRow label="Department" value={profile.department} />
              <FieldRow label="Joining date" value={profile.joining_date} />
            </SectionList>
          </FacultyPanel>
        </div>
      )}

      {tab === 'personal' && (
        <div className="space-y-5">
          <div className="rounded-xl border border-amber-200/90 bg-gradient-to-r from-amber-50 to-orange-50/50 p-4 shadow-sm">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex items-start gap-3 min-w-[200px] flex-1">
                <LockKeyhole className="mt-1 h-5 w-5 shrink-0 text-amber-700" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-950">Confidential KYC</p>
                  <p className="text-xs text-amber-900/80">Enter your password to reveal PAN, Aadhaar, and bank details.</p>
                  <Input
                    type="password"
                    className="mt-2 bg-white"
                    placeholder="Your password"
                    value={revealPassword}
                    onChange={(e) => setRevealPassword(e.target.value)}
                  />
                </div>
              </div>
              <Button variant="outline" className="border-amber-300 bg-white" onClick={() => void revealKyc()} disabled={revealing}>
                {kycRevealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                {kycRevealed ? 'Re-verify' : 'Reveal KYC'}
              </Button>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <FacultyPanel title="Personal details" description="Read-only from onboarding record">
              <SectionList>
                <FieldRow label="Date of birth" value={profile.personal.date_of_birth} />
                <FieldRow label="Blood group" value={profile.personal.blood_group} />
                <FieldRow label="Gender" value={profile.personal.gender} />
              </SectionList>
            </FacultyPanel>

            <FacultyPanel title="KYC & payroll" description={kycRevealed ? 'Full values shown — keep this private' : 'Masked until you reveal'}>
              <SectionList>
                <FieldRow label="PAN" value={kycRevealed?.pan ?? profile.kyc.pan_masked} mono />
                <FieldRow label="Aadhaar" value={kycRevealed?.aadhaar ?? profile.kyc.aadhaar_masked} mono />
                <FieldRow label="Bank account" value={kycRevealed?.bank_account ?? profile.kyc.bank_masked} mono />
                <FieldRow label="IFSC" value={kycRevealed?.ifsc_code ?? profile.kyc.ifsc_code} mono />
                <FieldRow label="UAN (PF)" value={kycRevealed?.pf_uan ?? profile.kyc.pf_uan} mono />
              </SectionList>
            </FacultyPanel>
          </div>

          <FacultyPanel title="Contact & address" description="You can edit emergency contact and addresses">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Emergency contact name">
                <Input
                  value={personalForm.emergency_contact_name}
                  onChange={(e) => setPersonalForm((p) => ({ ...p, emergency_contact_name: e.target.value }))}
                />
              </FormField>
              <FormField label="Emergency phone">
                <Input
                  value={personalForm.emergency_contact_phone}
                  onChange={(e) => setPersonalForm((p) => ({ ...p, emergency_contact_phone: e.target.value }))}
                />
              </FormField>
              <FormField label="Permanent address" className="sm:col-span-2">
                <textarea
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgvu-navy/20"
                  rows={2}
                  value={personalForm.permanent_address}
                  onChange={(e) => setPersonalForm((p) => ({ ...p, permanent_address: e.target.value }))}
                />
              </FormField>
              <FormField label="Current address" className="sm:col-span-2">
                <textarea
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgvu-navy/20"
                  rows={2}
                  value={personalForm.current_address}
                  onChange={(e) => setPersonalForm((p) => ({ ...p, current_address: e.target.value }))}
                />
              </FormField>
            </div>
            <Button className="mt-5" onClick={() => void savePersonal()} disabled={saving}>
              <Save className="h-4 w-4" />
              Save contact & address
            </Button>
          </FacultyPanel>

          <FacultyPanel
            title="Bank details change"
            description="Submitted changes require HR Admin approval"
          >
            {profile.bank_change_pending ? (
              <Badge variant="warning" className="mb-4">
                Pending HR approval since {new Date(profile.bank_change_pending.created_at).toLocaleDateString()}
              </Badge>
            ) : null}
            <form onSubmit={(e) => void submitBankChange(e)} className="grid gap-4 sm:grid-cols-2">
              <FormField label="New account number">
                <Input
                  value={bankForm.bank_account_no}
                  onChange={(e) => setBankForm((b) => ({ ...b, bank_account_no: e.target.value }))}
                />
              </FormField>
              <FormField label="IFSC code">
                <Input
                  value={bankForm.ifsc_code}
                  onChange={(e) => setBankForm((b) => ({ ...b, ifsc_code: e.target.value }))}
                />
              </FormField>
              <FormField label="Bank name (optional)" className="sm:col-span-2">
                <Input
                  value={bankForm.bank_name}
                  onChange={(e) => setBankForm((b) => ({ ...b, bank_name: e.target.value }))}
                />
              </FormField>
              <div className="sm:col-span-2">
                <Button type="submit" variant="outline" disabled={saving || profile.bank_change_pending != null}>
                  Submit for HR approval
                </Button>
              </div>
            </form>
          </FacultyPanel>
        </div>
      )}

      {tab === 'qualifications' && (
        <div className="space-y-5">
          <FacultyPanel title="Degree timeline" description="NAAC criterion 2.4 — faculty academic credentials">
            {profile.qualifications.length ? (
              <QualificationTimeline items={profile.qualifications} />
            ) : (
              <FacultyEmptyState
                title="No qualifications on file"
                description="Add your UG, PG, and PhD degrees for IQAC compliance."
              />
            )}
          </FacultyPanel>

          <FacultyPanel title="Add qualification" description="Upload degree certificate PDF for verification">
            <form onSubmit={(e) => void addQualification(e)} className="grid gap-4 sm:grid-cols-2">
              <FormField label="Level">
                <Select
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgvu-navy/20"
                  value={qualForm.degree_level}
                  onChange={(e) => setQualForm((q) => ({ ...q, degree_level: e.target.value }))}
                >
                  {DEGREE_LEVELS.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Degree name">
                <Input placeholder="e.g. M.Tech in AI" value={qualForm.degree_name} onChange={(e) => setQualForm((q) => ({ ...q, degree_name: e.target.value }))} />
              </FormField>
              <FormField label="University *">
                <Input value={qualForm.university} onChange={(e) => setQualForm((q) => ({ ...q, university: e.target.value }))} required />
              </FormField>
              <FormField label="Passing year *">
                <Input type="number" value={qualForm.passing_year} onChange={(e) => setQualForm((q) => ({ ...q, passing_year: e.target.value }))} required />
              </FormField>
              <FormField label="Specialization" className="sm:col-span-2">
                <Input value={qualForm.specialization} onChange={(e) => setQualForm((q) => ({ ...q, specialization: e.target.value }))} />
              </FormField>
              <FormField label="Degree certificate (PDF)" className="sm:col-span-2">
                <Input type="file" accept=".pdf,application/pdf" onChange={(e) => setQualFile(e.target.files?.[0] ?? null)} />
              </FormField>
              <div className="sm:col-span-2">
                <Button type="submit" disabled={addingQual}>
                  <Plus className="h-4 w-4" />
                  Add qualification
                </Button>
              </div>
            </form>
          </FacultyPanel>
        </div>
      )}

      {tab === 'research' && (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <FacultyStatCard label="Scopus papers" value={profile.research_summary.total_scopus_papers} accent="gold" />
            <FacultyStatCard label="Patents" value={profile.research_summary.total_patents} />
            <FacultyStatCard label="Grants received" value={profile.research_summary.total_grants_display} accent="navy" />
            <FacultyStatCard label="Publications" value={profile.research_summary.total_publications} />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <FacultyPanel title="Research identifiers" description="Editable — feeds IQAC metrics">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="ORCID ID">
                  <Input placeholder="0000-0002-1825-0097" value={researchForm.orcid_id} onChange={(e) => setResearchForm((r) => ({ ...r, orcid_id: e.target.value }))} />
                </FormField>
                <FormField label="Scopus ID">
                  <Input value={researchForm.scopus_id} onChange={(e) => setResearchForm((r) => ({ ...r, scopus_id: e.target.value }))} />
                </FormField>
                <FormField label="Google Scholar URL" className="sm:col-span-2">
                  <Input type="url" value={researchForm.google_scholar_url} onChange={(e) => setResearchForm((r) => ({ ...r, google_scholar_url: e.target.value }))} />
                </FormField>
                <FormField label="Teaching experience (years)">
                  <Input type="number" step="0.1" value={researchForm.total_experience_years} onChange={(e) => setResearchForm((r) => ({ ...r, total_experience_years: e.target.value }))} />
                </FormField>
                <FormField label="Industry experience (years)">
                  <Input type="number" step="0.1" value={researchForm.industry_experience_years} onChange={(e) => setResearchForm((r) => ({ ...r, industry_experience_years: e.target.value }))} />
                </FormField>
              </div>
              <Button className="mt-5" onClick={() => void saveResearch()} disabled={saving}>
                <Save className="h-4 w-4" />
                Save research profile
              </Button>
            </FacultyPanel>

            <FacultyPanel title="Publication matrix" description="From your research logs">
              <SectionList>
                <FieldRow label="Scopus-indexed journals" value={String(profile.research_summary.total_scopus_papers)} />
                <FieldRow label="Conference papers" value={String(profile.research_summary.total_conference_papers)} />
                <FieldRow label="Books / chapters" value={String(profile.research_summary.total_books)} />
                <FieldRow label="Patents" value={String(profile.research_summary.total_patents)} />
                <FieldRow label="Total grants" value={profile.research_summary.total_grants_display} />
              </SectionList>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Log publications on Research & Publications — they feed this matrix and your API score automatically.
              </p>
            </FacultyPanel>
          </div>
        </div>
      )}

      {tab === 'documents' && <MyDocumentsPanel />}

      {tab === 'workload' && (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <FacultyStatCard label="Weekly teaching hours" value={profile.workload.weekly_teaching_hours} sub="from timetable" icon={BookOpen} />
            <FacultyStatCard label="B.Tech project guides" value={profile.workload.project_guides_count} />
            <FacultyStatCard label="PhD scholars" value={profile.workload.phd_scholars_count} />
          </div>

          <FacultyPanel title="Current semester courses" description="Assigned via academic timetabling">
            {profile.workload.courses.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {profile.workload.courses.map((c, i) => (
                  <div
                    key={`${c.course_id}-${i}`}
                    className="rounded-xl border border-border/60 bg-gradient-to-br from-card to-muted/25 p-4 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-mono text-xs font-bold text-sgvu-gold">{c.course_code}</span>
                      <Badge variant="outline" className="text-[10px]">{c.session_type}</Badge>
                    </div>
                    <p className="mt-2 font-semibold text-sgvu-navy leading-snug">{c.course_name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{c.credits} credits</p>
                  </div>
                ))}
              </div>
            ) : (
              <FacultyEmptyState title="No courses assigned" description="Timetable entries will appear when allocated." />
            )}
          </FacultyPanel>

          {profile.workload.project_guides.length > 0 && (
            <FacultyPanel title="Final-year project guides">
              <SectionList>
                {profile.workload.project_guides.map((g, i) => (
                  <div key={`${g.guide_id}-${i}`} className="flex items-center justify-between gap-4 px-4 py-3.5">
                    <span className="font-medium text-sgvu-navy">{g.student_name}</span>
                    <span className="text-sm text-muted-foreground">{g.project_title ?? g.project_type ?? 'Project'}</span>
                  </div>
                ))}
              </SectionList>
            </FacultyPanel>
          )}

          {profile.workload.phd_scholars.length > 0 && (
            <FacultyPanel title="PhD scholars">
              <SectionList>
                {profile.workload.phd_scholars.map((s, i) => (
                  <div key={`${s.scholar_id}-${i}`} className="flex items-center justify-between gap-4 px-4 py-3.5">
                    <span className="font-medium text-sgvu-navy">{s.scholar_name}</span>
                    <Badge variant="outline">{s.current_phase}</Badge>
                  </div>
                ))}
              </SectionList>
            </FacultyPanel>
          )}
        </div>
      )}
    </FacultyPageShell>
  );
}
