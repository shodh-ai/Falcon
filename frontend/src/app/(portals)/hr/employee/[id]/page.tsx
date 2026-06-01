'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Lock, Eye } from 'lucide-react';
import { FalconLoader } from '@/components/brand/FalconLoader';
import { HrPageHeader } from '@/components/hr/HrPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';

type Profile360 = {
  user_id: string;
  name: string;
  email: string;
  role: string;
  department: string;
  employee_id: string;
  designation: string;
  joining_date: string;
  reporting_officer_name: string | null;
  kyc: {
    pan_masked: string;
    aadhaar_masked: string;
    bank_masked: string;
    pan?: string;
    aadhaar?: string;
    bank_account?: string;
  };
  documents: { document_type: string; verification_status: string }[];
};

function EmployeeProfileContent() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const api = useAuthedApi();
  const [profile, setProfile] = useState<Profile360 | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'kyc'>('overview');
  const [revealed, setRevealed] = useState(false);
  const [revealing, setRevealing] = useState(false);

  useEffect(() => {
    if (searchParams.get('tab') === 'kyc') setTab('kyc');
  }, [searchParams]);

  useEffect(() => {
    void api
      .get<Profile360>(`/api/hr/employees/${id}/360`)
      .then(setProfile)
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Load failed'))
      .finally(() => setLoading(false));
  }, [api, id]);

  async function reveal() {
    setRevealing(true);
    try {
      const data = await api.post<Profile360>(`/api/hr/employees/${id}/kyc/reveal`, { field_group: 'ALL' });
      setProfile(data);
      setRevealed(true);
      toast.success('KYC revealed — action logged in audit trail');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Reveal failed');
    } finally {
      setRevealing(false);
    }
  }

  if (loading) return <FalconLoader label="Loading employee 360° profile…" />;
  if (!profile) return null;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <HrPageHeader title={profile.name} description={`${profile.email} · ${profile.employee_id}`} />

      <div className="flex gap-2">
        <Button variant={tab === 'overview' ? 'default' : 'outline'} size="sm" onClick={() => setTab('overview')}>
          Overview
        </Button>
        <Button variant={tab === 'kyc' ? 'default' : 'outline'} size="sm" onClick={() => setTab('kyc')}>
          <Lock className="mr-1 h-4 w-4" />
          Secured KYC
        </Button>
      </div>

      {tab === 'overview' ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Employment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                <span className="text-muted-foreground">Designation:</span> {profile.designation}
              </p>
              <p>
                <span className="text-muted-foreground">Department:</span> {profile.department}
              </p>
              <p>
                <span className="text-muted-foreground">Joining date:</span>{' '}
                {profile.joining_date ? new Date(profile.joining_date).toLocaleDateString() : '—'}
              </p>
              <p>
                <span className="text-muted-foreground">Reporting officer:</span>{' '}
                {profile.reporting_officer_name ?? '—'}
              </p>
              <Badge>{profile.role}</Badge>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card className="border-sgvu-gold/40">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Encrypted KYC (PAN / Aadhaar / Bank)</CardTitle>
            {!revealed ? (
              <Button size="sm" disabled={revealing} onClick={() => void reveal()}>
                <Eye className="mr-1 h-4 w-4" />
                {revealing ? 'Revealing…' : 'Reveal'}
              </Button>
            ) : (
              <Badge variant="outline">Audit logged</Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-3 font-mono text-sm">
            <p>PAN: {revealed ? profile.kyc.pan : profile.kyc.pan_masked}</p>
            <p>Aadhaar: {revealed ? profile.kyc.aadhaar : profile.kyc.aadhaar_masked}</p>
            <p>Bank: {revealed ? profile.kyc.bank_account : profile.kyc.bank_masked}</p>
            {!revealed ? (
              <p className="text-xs text-muted-foreground">Click Reveal to decrypt fields for this session.</p>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function EmployeeProfilePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-muted-foreground">Loading profile…</div>}>
      <EmployeeProfileContent />
    </Suspense>
  );
}
