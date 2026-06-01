'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

  if (loading) return <p className="p-8 text-center text-sm text-muted-foreground">Loading profile…</p>;
  if (!profile) return <p className="p-8 text-center text-sm text-destructive">Profile unavailable.</p>;

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <StudentPageHeader
        title="My Profile & Master Data"
        description="Central identity card. Sensitive IDs are masked; corrections create an admin ticket (no direct edits)."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{profile.name}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {profile.enrollment_no ?? profile.student_id} · Semester {profile.semester}
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <p><span className="text-muted-foreground">Email</span><br />{profile.email}</p>
          <p><span className="text-muted-foreground">Mobile</span><br />{profile.mobile ?? '—'}</p>
          <p><span className="text-muted-foreground">Program / Branch</span><br />{profile.program} · {profile.branch}</p>
          <p><span className="text-muted-foreground">Session</span><br />{profile.session ?? '—'}</p>
          <p><span className="text-muted-foreground">Category</span><br />{profile.category ?? '—'}</p>
          <p><span className="text-muted-foreground">Gender / DOB</span><br />{profile.gender ?? '—'} · {profile.date_of_birth ?? '—'}</p>
          <p><span className="text-muted-foreground">Nationality</span><br />{profile.nationality}</p>
          <p>
            <span className="text-muted-foreground">Scholarship</span><br />
            {profile.scholarship ? JSON.stringify(profile.scholarship) : 'None on file'}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Security view (masked)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span>Aadhaar:</span>
            <Badge variant="secondary">{profile.aadhaar_masked ?? 'Not on file'}</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span>Passport:</span>
            <Badge variant="secondary">{profile.passport_masked ?? 'Not on file'}</Badge>
          </div>
          <p className="text-muted-foreground">Parent details and address are shown in summary only. Request corrections below.</p>
          {profile.parent_details && (
            <pre className="overflow-x-auto rounded-lg bg-muted/50 p-3 text-xs">{JSON.stringify(profile.parent_details, null, 2)}</pre>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Request profile correction</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Describe what needs to be updated…"
            value={requestNote}
            onChange={(e) => setRequestNote(e.target.value)}
          />
          <Button onClick={() => void submitUpdateRequest()}>Submit to Admin</Button>
        </CardContent>
      </Card>
    </div>
  );
}
