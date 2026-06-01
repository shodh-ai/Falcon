'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlumniPageHeader } from '@/components/alumni/AlumniPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';

type Profile = {
  current_organization: string | null;
  designation: string | null;
  linkedin_url: string | null;
  higher_education_details: { degree?: string; university?: string };
  opt_in_mentorship: boolean;
  needs_career_update: boolean;
};

export default function AlumniProfilePage() {
  const api = useAuthedApi();
  const [form, setForm] = useState({
    current_organization: '',
    designation: '',
    linkedin_url: '',
    degree: '',
    university: '',
    opt_in_mentorship: false,
  });

  useEffect(() => {
    void api.get<Profile>('/api/alumni/me/profile').then((p) => {
      setForm({
        current_organization: p.current_organization ?? '',
        designation: p.designation ?? '',
        linkedin_url: p.linkedin_url ?? '',
        degree: p.higher_education_details?.degree ?? '',
        university: p.higher_education_details?.university ?? '',
        opt_in_mentorship: p.opt_in_mentorship,
      });
    });
  }, [api]);

  async function save() {
    try {
      await api.patch('/api/alumni/me/profile', {
        current_organization: form.current_organization,
        designation: form.designation,
        linkedin_url: form.linkedin_url,
        opt_in_mentorship: form.opt_in_mentorship,
        higher_education_details: { degree: form.degree, university: form.university },
      });
      toast.success('Career profile updated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <AlumniPageHeader
        title="My Career Profile"
        description="Keep your organization, designation, LinkedIn, and higher education current (review every 6 months)."
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Professional details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Current organization" value={form.current_organization} onChange={(e) => setForm({ ...form, current_organization: e.target.value })} />
          <Input placeholder="Designation" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
          <Input placeholder="LinkedIn profile URL" value={form.linkedin_url} onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })} />
          <p className="text-xs text-muted-foreground">
            Optional: Sync from LinkedIn (premium integration) — paste your profile URL for now.
          </p>
          <Input placeholder="Higher education degree (e.g. MS)" value={form.degree} onChange={(e) => setForm({ ...form, degree: e.target.value })} />
          <Input placeholder="University (e.g. Stanford)" value={form.university} onChange={(e) => setForm({ ...form, university: e.target.value })} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.opt_in_mentorship} onChange={(e) => setForm({ ...form, opt_in_mentorship: e.target.checked })} />
            Opt in to mentor current students
          </label>
          <Button onClick={() => void save()}>Save profile</Button>
        </CardContent>
      </Card>
    </div>
  );
}
