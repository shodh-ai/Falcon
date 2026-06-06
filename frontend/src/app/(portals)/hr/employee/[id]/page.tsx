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
import { useHrApi } from '@/lib/api/use-hr-api';
import { useHrEntity } from '@/context/HrEntityContext';

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
  org_unit_id: string | null;
  org_unit_name: string | null;
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
  const api = useHrApi();
  const { entityId } = useHrEntity();
  const [profile, setProfile] = useState<Profile360 | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'kyc'>('overview');
  const [revealed, setRevealed] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [orgUnits, setOrgUnits] = useState<{ unit_id: string; unit_name: string; unit_type: string }[]>([]);
  const [orgUnitId, setOrgUnitId] = useState('');

  useEffect(() => {
    if (searchParams.get('tab') === 'kyc') setTab('kyc');
  }, [searchParams]);

  useEffect(() => {
    setLoading(true);
    void api
      .get<Profile360>(`/api/hr/employees/${id}/360`)
      .then((p) => {
        setProfile(p);
        setOrgUnitId(p.org_unit_id ?? '');
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Load failed'))
      .finally(() => setLoading(false));
    void api.get<{ unit_id: string; unit_name: string; unit_type: string }[]>('/api/hr/org-units').then(setOrgUnits);
  }, [api, entityId, id]);

  async function saveOrgUnit() {
    try {
      await api.patch(`/api/hr/employees/${id}/master`, { org_unit_id: orgUnitId || null });
      toast.success('Org unit updated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    }
  }

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
    <>
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
              <p>
                <span className="text-muted-foreground">Org unit:</span>{' '}
                {profile.org_unit_name ?? '—'}
              </p>
              <div className="flex gap-2 pt-2">
                <select
                  className="flex-1 rounded-md border px-2 py-1 text-sm"
                  value={orgUnitId}
                  onChange={(e) => setOrgUnitId(e.target.value)}
                >
                  <option value="">— Select org unit —</option>
                  {orgUnits.map((u) => (
                    <option key={u.unit_id} value={u.unit_id}>
                      {u.unit_name} ({u.unit_type})
                    </option>
                  ))}
                </select>
                <Button size="sm" variant="outline" onClick={() => void saveOrgUnit()}>
                  Save
                </Button>
              </div>
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
    </>
  );
}

export default function EmployeeProfilePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-muted-foreground">Loading profile…</div>}>
      <EmployeeProfileContent />
    </Suspense>
  );
}
