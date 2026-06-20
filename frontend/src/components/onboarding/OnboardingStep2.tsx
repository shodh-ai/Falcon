'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileCheck2, Send } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { OnboardingDocDropzone } from '@/components/student/OnboardingDocDropzone';
import { useAuth } from '@/context/AuthContext';
import { useAuthedApi } from '@/lib/api';
import {
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

const selectClassName =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgvu-navy/20';

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
    return <p className="text-center text-sm text-muted-foreground">Loading profile…</p>;
  }

  return (
    <div className="space-y-6">
      {adminRemarks && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Admin feedback: {adminRemarks}. Please re-upload clearer documents and resubmit.
        </div>
      )}

      <Card className="border-sgvu-navy/10 shadow-lg">
        <CardHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-sgvu-navy/10">
            <FileCheck2 className="h-5 w-5 text-sgvu-navy" />
          </div>
          <CardTitle className="text-sgvu-navy">Step 2 · Profile & Document Vault</CardTitle>
          <CardDescription>
            {isStaff
              ? 'Complete your NAAC master record — personal details, KYC, research profile, and mandatory documents.'
              : 'Complete your vital information and upload all mandatory documents.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-sgvu-navy">Personal details</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <label htmlFor="blood" className="text-sm font-medium">Blood Group</label>
                <Input id="blood" value={bloodGroup} onChange={(e) => setBloodGroup(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <label htmlFor="mobile" className="text-sm font-medium">
                  {isStaff ? 'Mobile Number' : 'Student Mobile'}
                </label>
                <Input id="mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} required />
              </div>
              {!isStaff && (
                <div className="space-y-2">
                  <label htmlFor="id-field" className="text-sm font-medium">ABC ID</label>
                  <Input
                    id="id-field"
                    value={abcId}
                    onChange={(e) => setAbcId(e.target.value)}
                    placeholder="Your 12-digit Academic Bank ID (unique per student)"
                    required
                  />
                </div>
              )}
              <div className="space-y-2">
                <label htmlFor="gender" className="text-sm font-medium">Gender</label>
                <Input id="gender" value={gender} onChange={(e) => setGender(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <label htmlFor="dob" className="text-sm font-medium">Date of Birth</label>
                <Input id="dob" type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} required />
              </div>
            </div>
          </div>

          {isStaff && (
            <>
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-sgvu-navy">KYC & payroll</h3>
                <p className="text-xs text-muted-foreground">
                  Enter account numbers below — uploading Aadhaar/PAN files alone does not fill these fields.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor="pan" className="text-sm font-medium">PAN Number</label>
                    <Input id="pan" value={panNumber} onChange={(e) => setPanNumber(e.target.value.toUpperCase())} required />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="aadhaar" className="text-sm font-medium">Aadhaar Number</label>
                    <Input id="aadhaar" value={aadhaarNumber} onChange={(e) => setAadhaarNumber(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="bank" className="text-sm font-medium">Bank Account Number</label>
                    <Input id="bank" value={bankAccountNo} onChange={(e) => setBankAccountNo(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="ifsc" className="text-sm font-medium">IFSC Code</label>
                    <Input id="ifsc" value={ifscCode} onChange={(e) => setIfscCode(e.target.value.toUpperCase())} required />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <label htmlFor="uan" className="text-sm font-medium">UAN (PF) — optional</label>
                    <Input id="uan" value={pfUan} onChange={(e) => setPfUan(e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-sgvu-navy">Research & experience</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor="orcid" className="text-sm font-medium">ORCID ID</label>
                    <Input id="orcid" placeholder="0000-0002-1825-0097" value={orcidId} onChange={(e) => setOrcidId(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="scopus" className="text-sm font-medium">Scopus ID</label>
                    <Input id="scopus" value={scopusId} onChange={(e) => setScopusId(e.target.value)} />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <label htmlFor="scholar" className="text-sm font-medium">Google Scholar URL</label>
                    <Input id="scholar" type="url" value={googleScholarUrl} onChange={(e) => setGoogleScholarUrl(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="teaching-exp" className="text-sm font-medium">Teaching experience (years)</label>
                    <Input id="teaching-exp" type="number" step="0.1" min="0" value={totalExperienceYears} onChange={(e) => setTotalExperienceYears(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="industry-exp" className="text-sm font-medium">Industry experience (years)</label>
                    <Input id="industry-exp" type="number" step="0.1" min="0" value={industryExperienceYears} onChange={(e) => setIndustryExperienceYears(e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-sgvu-navy">Highest qualification</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor="degree-level" className="text-sm font-medium">Degree level</label>
                    <select id="degree-level" className={selectClassName} value={degreeLevel} onChange={(e) => setDegreeLevel(e.target.value)} required>
                      {STAFF_DEGREE_LEVELS.map((level) => (
                        <option key={level} value={level}>{level}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="degree-name" className="text-sm font-medium">Degree name</label>
                    <Input id="degree-name" placeholder="e.g. M.Tech in AI" value={degreeName} onChange={(e) => setDegreeName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="university" className="text-sm font-medium">University</label>
                    <Input id="university" value={university} onChange={(e) => setUniversity(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="passing-year" className="text-sm font-medium">Passing year</label>
                    <Input id="passing-year" type="number" value={passingYear} onChange={(e) => setPassingYear(e.target.value)} required />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <label htmlFor="specialization" className="text-sm font-medium">Specialization</label>
                    <Input id="specialization" value={specialization} onChange={(e) => setSpecialization(e.target.value)} />
                  </div>
                </div>
              </div>
            </>
          )}

          {!isStaff && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-sgvu-navy">Parent details</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input placeholder="Father's name" value={fatherName} onChange={(e) => setFatherName(e.target.value)} required />
                <Input placeholder="Mother's name" value={motherName} onChange={(e) => setMotherName(e.target.value)} required />
                <Input placeholder="Parent contact number" value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} required />
                <Input placeholder="Parent occupation" value={parentOccupation} onChange={(e) => setParentOccupation(e.target.value)} />
                <Input placeholder="Annual income / scholarships" value={annualIncome} onChange={(e) => setAnnualIncome(e.target.value)} />
              </div>
            </div>
          )}

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-sgvu-navy">Emergency & address</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input placeholder="Emergency contact name" value={emergencyContactName} onChange={(e) => setEmergencyContactName(e.target.value)} required />
              {isStaff && (
                <Input placeholder="Emergency contact phone" value={emergencyContactPhone} onChange={(e) => setEmergencyContactPhone(e.target.value)} required />
              )}
              <textarea
                className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm sm:col-span-1"
                placeholder="Permanent address"
                value={permanentAddress}
                onChange={(e) => setPermanentAddress(e.target.value)}
                required
              />
              <textarea
                className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm sm:col-span-1"
                placeholder="Current address"
                value={currentAddress}
                onChange={(e) => setCurrentAddress(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-sgvu-navy">Mandatory documents</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {docTypes.map((docType) => {
                const existing = documents.find((d) => d.doc_type === docType);
                return (
                  <OnboardingDocDropzone
                    key={docType}
                    label={docLabels[docType]}
                    hint={docType === 'PHOTO' ? 'JPG or PNG · Max 5MB' : 'PDF or image · Max 5MB'}
                    accept={docType === 'PHOTO' ? '.jpg,.jpeg,.png,image/jpeg,image/png' : undefined}
                    disabled={uploading !== null}
                    fileName={existing?.file_path ? docLabels[docType] : null}
                    onFile={(file) => void uploadDoc(docType, file)}
                  />
                );
              })}
            </div>
          </div>

          <Button
            type="button"
            className="w-full bg-sgvu-navy hover:bg-sgvu-navy/90"
            disabled={submitting || uploading !== null}
            onClick={() => void saveAndSubmit()}
          >
            <Send className="mr-2 h-4 w-4" />
            {submitting ? 'Submitting…' : 'Submit for Verification'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
