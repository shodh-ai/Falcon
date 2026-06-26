'use client';

import { Select } from '@/components/ui/select';
import { useCallback, useEffect, useMemo, useState, type ComponentProps } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileCheck2,
  Home,
  Loader2,
  Send,
  UserRound,
  Users,
} from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { OnboardingDocDropzone } from '@/components/student/OnboardingDocDropzone';
import {
  OnboardingAlert,
  OnboardingDivider,
  OnboardingField,
  OnboardingPanel,
  OnboardingSection,
  OnboardingSidebarCard,
  onboardingInputClass,
  onboardingSelectClass,
  onboardingTextareaClass,
} from '@/components/onboarding/onboarding-ui';
import { useAuth } from '@/context/AuthContext';
import { useAuthedApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  BLOOD_GROUP_OPTIONS,
  GENDER_OPTIONS,
  STAFF_DEGREE_LEVELS,
  STAFF_DOC_LABELS,
  STUDENT_DOC_LABELS,
  type PortalOnboardingConfig,
} from '@/lib/onboarding/portal-onboarding';

type OnboardingDoc = {
  doc_type: string;
  file_path: string;
  status: string;
};

function parseApiError(err: unknown) {
  if (!(err instanceof Error)) return 'Something went wrong';
  try {
    const parsed = JSON.parse(err.message) as { message?: string | string[] };
    if (Array.isArray(parsed.message)) return parsed.message.join(', ');
    if (parsed.message) return parsed.message;
  } catch {
    /* plain text */
  }
  return err.message;
}

function validateStudentForm(values: {
  bloodGroup: string;
  mobile: string;
  abcId: string;
  gender: string;
  dateOfBirth: string;
  fatherName: string;
  motherName: string;
  parentPhone: string;
  emergencyContactName: string;
  permanentAddress: string;
  currentAddress: string;
}) {
  const missing: string[] = [];
  if (!values.bloodGroup.trim()) missing.push('Blood group');
  if (!values.mobile.trim()) missing.push('Student mobile');
  if (!values.abcId.trim()) missing.push('ABC ID');
  if (!values.gender.trim()) missing.push('Gender');
  if (!values.dateOfBirth.trim()) missing.push('Date of birth');
  if (!values.fatherName.trim()) missing.push("Father's name");
  if (!values.motherName.trim()) missing.push("Mother's name");
  if (!values.parentPhone.trim()) missing.push('Parent contact number');
  if (!values.emergencyContactName.trim()) missing.push('Emergency contact name');
  if (!values.permanentAddress.trim()) missing.push('Permanent address');
  if (!values.currentAddress.trim()) missing.push('Current address');
  return missing;
}

function DocumentsSidebar({
  docTypes,
  docLabels,
  documents,
  uploading,
  uploadedCount,
  onUpload,
  className,
}: {
  docTypes: string[];
  docLabels: Record<string, string>;
  documents: OnboardingDoc[];
  uploading: string | null;
  uploadedCount: number;
  onUpload: (docType: string, file: File) => void;
  className?: string;
}) {
  const pct = Math.round((uploadedCount / docTypes.length) * 100);

  return (
    <OnboardingSidebarCard
      className={className}
      title="Document checklist"
      description={`${uploadedCount} of ${docTypes.length} uploaded · ${pct}% complete`}
    >
      <div className="mb-1 h-1.5 overflow-hidden rounded-full bg-white">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="space-y-2.5">
        {docTypes.map((docType) => {
          const existing = documents.find((d) => d.doc_type === docType);
          const isUploading = uploading === docType;
          return (
            <div key={docType} className="relative">
              {isUploading ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/80">
                  <Loader2 className="h-5 w-5 animate-spin text-sgvu-navy" />
                </div>
              ) : null}
              <OnboardingDocDropzone
                label={docLabels[docType]}
                hint={docType === 'PHOTO' ? 'JPG or PNG · Max 5MB' : 'PDF or image · Max 5MB'}
                accept={docType === 'PHOTO' ? '.jpg,.jpeg,.png,image/jpeg,image/png' : undefined}
                disabled={uploading !== null}
                fileName={existing?.file_path ? docLabels[docType] : null}
                onFile={(file) => onUpload(docType, file)}
              />
            </div>
          );
        })}
      </div>
    </OnboardingSidebarCard>
  );
}

function SubmitBlock({
  submitting,
  uploading,
  onSubmit,
}: {
  submitting: boolean;
  uploading: string | null;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-2">
      <Button
        type="button"
        className="h-11 w-full rounded-lg bg-sgvu-navy text-sm font-semibold hover:bg-sgvu-navy/90"
        disabled={submitting || uploading !== null}
        onClick={onSubmit}
      >
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Submitting…
          </>
        ) : (
          <>
            <Send className="mr-2 h-4 w-4" />
            Submit for verification
          </>
        )}
      </Button>
      <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
        Reviewed by administration before portal access is granted.
      </p>
    </div>
  );
}

export function OnboardingStep2({ config }: { config: PortalOnboardingConfig }) {
  const api = useAuthedApi();
  const router = useRouter();
  const { refreshUser } = useAuth();
  const isStaff = config.kind === 'staff';
  const docLabels = isStaff ? STAFF_DOC_LABELS : STUDENT_DOC_LABELS;
  const docTypes = Object.keys(docLabels);

  const [bloodGroup, setBloodGroup] = useState('');
  const [abcId, setAbcId] = useState('');
  const [panNumber, setPanNumber] = useState('');
  const [aadhaarNumber, setAadhaarNumber] = useState('');
  const [bankAccountNo, setBankAccountNo] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [pfUan, setPfUan] = useState('');
  const [mobile, setMobile] = useState('');
  const [gender, setGender] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [fatherName, setFatherName] = useState('');
  const [motherName, setMotherName] = useState('');
  const [parentOccupation, setParentOccupation] = useState('');
  const [annualIncome, setAnnualIncome] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [permanentAddress, setPermanentAddress] = useState('');
  const [currentAddress, setCurrentAddress] = useState('');
  const [orcidId, setOrcidId] = useState('');
  const [scopusId, setScopusId] = useState('');
  const [googleScholarUrl, setGoogleScholarUrl] = useState('');
  const [totalExperienceYears, setTotalExperienceYears] = useState('');
  const [industryExperienceYears, setIndustryExperienceYears] = useState('0');
  const [degreeLevel, setDegreeLevel] = useState('PG');
  const [degreeName, setDegreeName] = useState('');
  const [university, setUniversity] = useState('');
  const [passingYear, setPassingYear] = useState(String(new Date().getFullYear()));
  const [specialization, setSpecialization] = useState('');
  const [documents, setDocuments] = useState<OnboardingDoc[]>([]);
  const [adminRemarks, setAdminRemarks] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const uploadedCount = useMemo(
    () => docTypes.filter((t) => documents.some((d) => d.doc_type === t && d.file_path)).length,
    [docTypes, documents],
  );

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<Record<string, unknown>>(`${config.apiPrefix}/profile`);
      setBloodGroup(String(data.blood_group ?? ''));
      setAbcId(String(data.abc_id ?? ''));
      setPanNumber(String(data.pan_number ?? ''));
      setAadhaarNumber(String(data.aadhaar_number ?? ''));
      setBankAccountNo(String(data.bank_account_no ?? ''));
      setIfscCode(String(data.ifsc_code ?? ''));
      setPfUan(String(data.pf_uan ?? ''));
      setMobile(String(data.staff_mobile ?? data.student_mobile ?? ''));
      setGender(String(data.gender ?? ''));
      setDateOfBirth(data.date_of_birth ? String(data.date_of_birth).slice(0, 10) : '');
      setFatherName(String(data.father_name ?? ''));
      setMotherName(String(data.mother_name ?? ''));
      setParentOccupation(String(data.parent_occupation ?? ''));
      setAnnualIncome(String(data.annual_income ?? ''));
      setParentPhone(String(data.parent_contact_phone ?? ''));
      setEmergencyContactName(String(data.emergency_contact_name ?? ''));
      setEmergencyContactPhone(String(data.emergency_contact_phone ?? data.parent_contact_phone ?? ''));
      setPermanentAddress(String(data.permanent_address ?? ''));
      setCurrentAddress(String(data.current_address ?? ''));
      setOrcidId(String(data.orcid_id ?? ''));
      setScopusId(String(data.scopus_id ?? ''));
      setGoogleScholarUrl(String(data.google_scholar_url ?? ''));
      setTotalExperienceYears(String(data.total_experience_years ?? ''));
      setIndustryExperienceYears(String(data.industry_experience_years ?? '0'));
      setDegreeLevel(String(data.degree_level ?? 'PG'));
      setDegreeName(String(data.degree_name ?? ''));
      setUniversity(String(data.university ?? ''));
      setPassingYear(String(data.passing_year ?? new Date().getFullYear()));
      setSpecialization(String(data.specialization ?? ''));
      setDocuments((data.documents as OnboardingDoc[]) ?? []);
      setAdminRemarks((data.admin_remarks as string | null) ?? null);
    } catch (err) {
      toast.error(parseApiError(err));
    } finally {
      setLoading(false);
    }
  }, [api, config.apiPrefix]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const uploadDoc = async (docType: string, file: File) => {
    setUploading(docType);
    try {
      const form = new FormData();
      form.append('file', file);
      const updated = await api.post<OnboardingDoc[]>(
        `${config.apiPrefix}/documents/${docType}`,
        form,
      );
      setDocuments(updated);
      toast.success(`${docLabels[docType] ?? docType} uploaded`);
    } catch (err) {
      toast.error(parseApiError(err));
    } finally {
      setUploading(null);
    }
  };

  const saveAndSubmit = async () => {
    if (!isStaff) {
      const missing = validateStudentForm({
        bloodGroup,
        mobile,
        abcId,
        gender,
        dateOfBirth,
        fatherName,
        motherName,
        parentPhone,
        emergencyContactName,
        permanentAddress,
        currentAddress,
      });
      if (missing.length) {
        toast.error(`Please fill: ${missing.join(', ')}`);
        return;
      }
    }

    const missingDocs = docTypes.filter(
      (type) => !documents.some((d) => d.doc_type === type && d.file_path),
    );
    if (missingDocs.length) {
      toast.error(`Upload all documents: ${missingDocs.map((t) => docLabels[t]).join(', ')}`);
      return;
    }

    setSubmitting(true);
    try {
      const payload = isStaff
        ? {
            blood_group: bloodGroup,
            staff_mobile: mobile,
            pan_number: panNumber,
            aadhaar_number: aadhaarNumber,
            bank_account_no: bankAccountNo,
            ifsc_code: ifscCode,
            pf_uan: pfUan,
            gender,
            date_of_birth: dateOfBirth,
            emergency_contact_name: emergencyContactName,
            emergency_contact_phone: emergencyContactPhone,
            permanent_address: permanentAddress,
            current_address: currentAddress,
            orcid_id: orcidId,
            scopus_id: scopusId,
            google_scholar_url: googleScholarUrl,
            total_experience_years: totalExperienceYears,
            industry_experience_years: industryExperienceYears,
            degree_level: degreeLevel,
            degree_name: degreeName,
            university,
            passing_year: passingYear,
            specialization,
          }
        : {
            blood_group: bloodGroup,
            parent_contact_phone: parentPhone,
            abc_id: abcId,
            student_mobile: mobile,
            gender,
            date_of_birth: dateOfBirth,
            father_name: fatherName,
            mother_name: motherName,
            parent_occupation: parentOccupation,
            annual_income: annualIncome,
            emergency_contact_name: emergencyContactName,
            permanent_address: permanentAddress,
            current_address: currentAddress,
          };

      await api.post(`${config.apiPrefix}/profile`, payload);
      await api.post(`${config.apiPrefix}/submit`);
      await refreshUser();
      toast.success('Submitted for admin verification');
      router.replace(`${config.portalPrefix}/onboarding/step-3`);
    } catch (err) {
      toast.error(parseApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border/60 bg-white py-20 shadow-sm">
        <Loader2 className="h-9 w-9 animate-spin text-sgvu-navy" />
        <p className="text-sm text-muted-foreground">Loading your profile…</p>
      </div>
    );
  }

  const docsSidebar = (
    <DocumentsSidebar
      docTypes={docTypes}
      docLabels={docLabels}
      documents={documents}
      uploading={uploading}
      uploadedCount={uploadedCount}
      onUpload={(type, file) => void uploadDoc(type, file)}
    />
  );

  return (
    <div className="space-y-5">
      {adminRemarks ? (
        <OnboardingAlert title="Admin feedback">
          {adminRemarks}. Please re-upload clearer documents and resubmit.
        </OnboardingAlert>
      ) : null}

      <OnboardingPanel
        icon={FileCheck2}
        title="Profile & documents"
        description={
          isStaff
            ? 'Complete your NAAC master record with personal details, KYC, and mandatory documents.'
            : 'Tell us about yourself and upload the required documents. Fields marked * are mandatory.'
        }
      >
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-8 xl:gap-10">
          {/* Form column */}
          <div className="space-y-8">
            <OnboardingSection title="Personal details" icon={UserRound} description="Basic information for your record">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField id="blood" label="Blood group" required>
                  <Select id="blood" className={onboardingSelectClass} value={bloodGroup} onChange={(e) => setBloodGroup(e.target.value)} required>
                    <option value="">Select</option>
                    {BLOOD_GROUP_OPTIONS.map((bg) => (
                      <option key={bg} value={bg}>{bg}</option>
                    ))}
                  </Select>
                </FormField>

                <FormField id="mobile" label={isStaff ? 'Mobile number' : 'Student mobile'} required>
                  <Input id="mobile" inputMode="tel" placeholder="10-digit number" className={onboardingInputClass} value={mobile} onChange={(e) => setMobile(e.target.value)} required />
                </FormField>

                {!isStaff ? (
                  <FormField id="abc-id" label="ABC ID" required hint="12-digit Academic Bank of Credits ID" className="sm:col-span-2">
                    <Input id="abc-id" inputMode="numeric" placeholder="123456789012" className={onboardingInputClass} value={abcId} onChange={(e) => setAbcId(e.target.value.replace(/\D/g, '').slice(0, 12))} required />
                  </FormField>
                ) : null}

                <FormField id="gender" label="Gender" required>
                  <Select id="gender" className={onboardingSelectClass} value={gender} onChange={(e) => setGender(e.target.value)} required>
                    <option value="">Select</option>
                    {GENDER_OPTIONS.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </Select>
                </FormField>

                <FormField id="dob" label="Date of birth" required>
                  <Input id="dob" type="date" className={onboardingInputClass} value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} required />
                </FormField>
              </div>
            </OnboardingSection>

            {isStaff ? (
              <>
                <OnboardingDivider />
                <OnboardingSection title="KYC & payroll">
                  <p className="mb-3 text-xs text-muted-foreground">Enter numbers below — uploading files alone does not fill these fields.</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField id="pan" label="PAN number" required><Input id="pan" className={onboardingInputClass} value={panNumber} onChange={(e) => setPanNumber(e.target.value.toUpperCase())} required /></FormField>
                    <FormField id="aadhaar" label="Aadhaar number" required><Input id="aadhaar" className={onboardingInputClass} value={aadhaarNumber} onChange={(e) => setAadhaarNumber(e.target.value)} required /></FormField>
                    <FormField id="bank" label="Bank account" required><Input id="bank" className={onboardingInputClass} value={bankAccountNo} onChange={(e) => setBankAccountNo(e.target.value)} required /></FormField>
                    <FormField id="ifsc" label="IFSC code" required><Input id="ifsc" className={onboardingInputClass} value={ifscCode} onChange={(e) => setIfscCode(e.target.value.toUpperCase())} required /></FormField>
                    <FormField id="uan" label="UAN (PF)" className="sm:col-span-2"><Input id="uan" className={onboardingInputClass} value={pfUan} onChange={(e) => setPfUan(e.target.value)} /></FormField>
                  </div>
                </OnboardingSection>
                <OnboardingDivider />
                <OnboardingSection title="Research & experience">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField id="orcid" label="ORCID ID" required><Input id="orcid" className={onboardingInputClass} placeholder="0000-0002-1825-0097" value={orcidId} onChange={(e) => setOrcidId(e.target.value)} required /></FormField>
                    <FormField id="scopus" label="Scopus ID"><Input id="scopus" className={onboardingInputClass} value={scopusId} onChange={(e) => setScopusId(e.target.value)} /></FormField>
                    <FormField id="scholar" label="Google Scholar URL" className="sm:col-span-2"><Input id="scholar" type="url" className={onboardingInputClass} value={googleScholarUrl} onChange={(e) => setGoogleScholarUrl(e.target.value)} /></FormField>
                    <FormField id="teaching-exp" label="Teaching experience (years)" required><Input id="teaching-exp" type="number" step="0.1" min="0" className={onboardingInputClass} value={totalExperienceYears} onChange={(e) => setTotalExperienceYears(e.target.value)} required /></FormField>
                    <FormField id="industry-exp" label="Industry experience (years)"><Input id="industry-exp" type="number" step="0.1" min="0" className={onboardingInputClass} value={industryExperienceYears} onChange={(e) => setIndustryExperienceYears(e.target.value)} /></FormField>
                  </div>
                </OnboardingSection>
                <OnboardingDivider />
                <OnboardingSection title="Highest qualification">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField id="degree-level" label="Degree level" required>
                      <Select id="degree-level" className={onboardingSelectClass} value={degreeLevel} onChange={(e) => setDegreeLevel(e.target.value)} required>
                        {STAFF_DEGREE_LEVELS.map((level) => (<option key={level} value={level}>{level}</option>))}
                      </Select>
                    </FormField>
                    <FormField id="degree-name" label="Degree name"><Input id="degree-name" className={onboardingInputClass} placeholder="M.Tech in AI" value={degreeName} onChange={(e) => setDegreeName(e.target.value)} /></FormField>
                    <FormField id="university" label="University" required><Input id="university" className={onboardingInputClass} value={university} onChange={(e) => setUniversity(e.target.value)} required /></FormField>
                    <FormField id="passing-year" label="Passing year" required><Input id="passing-year" type="number" className={onboardingInputClass} value={passingYear} onChange={(e) => setPassingYear(e.target.value)} required /></FormField>
                    <FormField id="specialization" label="Specialization" className="sm:col-span-2"><Input id="specialization" className={onboardingInputClass} value={specialization} onChange={(e) => setSpecialization(e.target.value)} /></FormField>
                  </div>
                </OnboardingSection>
              </>
            ) : (
              <>
                <OnboardingDivider />
                <OnboardingSection title="Parent / guardian" icon={Users}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField id="father" label="Father's name" required><Input id="father" className={onboardingInputClass} value={fatherName} onChange={(e) => setFatherName(e.target.value)} required /></FormField>
                    <FormField id="mother" label="Mother's name" required><Input id="mother" className={onboardingInputClass} value={motherName} onChange={(e) => setMotherName(e.target.value)} required /></FormField>
                    <FormField id="parent-phone" label="Parent contact" required><Input id="parent-phone" inputMode="tel" className={onboardingInputClass} value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} required /></FormField>
                    <FormField id="parent-occupation" label="Parent occupation"><Input id="parent-occupation" className={onboardingInputClass} value={parentOccupation} onChange={(e) => setParentOccupation(e.target.value)} /></FormField>
                    <FormField id="annual-income" label="Annual income / scholarships" className="sm:col-span-2"><Input id="annual-income" className={onboardingInputClass} value={annualIncome} onChange={(e) => setAnnualIncome(e.target.value)} /></FormField>
                  </div>
                </OnboardingSection>
              </>
            )}

            <OnboardingDivider />

            <OnboardingSection title="Emergency & address" icon={Home} description="For campus records and emergency contact">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField id="emergency-name" label="Emergency contact name" required className="sm:col-span-2">
                  <Input id="emergency-name" className={onboardingInputClass} value={emergencyContactName} onChange={(e) => setEmergencyContactName(e.target.value)} required />
                </FormField>
                {isStaff ? (
                  <FormField id="emergency-phone" label="Emergency contact phone" required className="sm:col-span-2">
                    <Input id="emergency-phone" inputMode="tel" className={onboardingInputClass} value={emergencyContactPhone} onChange={(e) => setEmergencyContactPhone(e.target.value)} required />
                  </FormField>
                ) : null}
                <FormField id="permanent-address" label="Permanent address" required>
                  <textarea id="permanent-address" className={onboardingTextareaClass} placeholder="House, street, city, PIN" value={permanentAddress} onChange={(e) => setPermanentAddress(e.target.value)} required />
                </FormField>
                <FormField id="current-address" label="Current address" required>
                  <textarea id="current-address" className={onboardingTextareaClass} placeholder="Hostel or rental address" value={currentAddress} onChange={(e) => setCurrentAddress(e.target.value)} required />
                </FormField>
              </div>
            </OnboardingSection>

            {/* Mobile documents + submit */}
            <div className="space-y-4 lg:hidden">
              <OnboardingDivider />
              {docsSidebar}
              <SubmitBlock submitting={submitting} uploading={uploading} onSubmit={() => void saveAndSubmit()} />
            </div>
          </div>

          {/* Desktop sidebar */}
          <aside className={cn('hidden space-y-4 lg:sticky lg:top-8 lg:block lg:self-start')}>
            {docsSidebar}
            <SubmitBlock submitting={submitting} uploading={uploading} onSubmit={() => void saveAndSubmit()} />
          </aside>
        </div>
      </OnboardingPanel>
    </div>
  );
}

function FormField(props: ComponentProps<typeof OnboardingField>) {
  return <OnboardingField {...props} />;
}
