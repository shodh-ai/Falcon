'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  Briefcase,
  Building2,
  FileText,
  GraduationCap,
  Kanban,
  Users,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlacementPageHeader } from '@/components/placement/PlacementPageHeader';
import { PlacementPageShell } from '@/components/placement/PlacementPageShell';
import { useAuthedApi } from '@/lib/api';

export default function PlacementsDashboardPage() {
  const api = useAuthedApi();
  const [companyCount, setCompanyCount] = useState(0);
  const [driveCount, setDriveCount] = useState(0);
  const [activeDrives, setActiveDrives] = useState(0);

  useEffect(() => {
    void Promise.all([
      api.get<unknown[]>('/api/placement/companies'),
      api.get<{ data: Array<{ status: string }>; total: number }>('/api/placement/drives?limit=100&offset=0'),
    ])
      .then(([companies, drivesPage]) => {
        setCompanyCount(companies.length);
        setDriveCount(drivesPage.total);
        setActiveDrives(
          drivesPage.data.filter((d) => d.status === 'ACTIVE' || d.status === 'OPEN').length,
        );
      })
      .catch(() => {});
  }, [api]);

  const modules = [
    {
      href: '/placements/companies',
      label: 'Company Master',
      description: 'Visiting recruiters, HR contacts, industry tags',
      icon: Building2,
    },
    {
      href: '/placements/drives',
      label: 'Drives & ATS',
      description: 'Create drives, drag-and-drop interview pipeline',
      icon: Kanban,
    },
    {
      href: '/placements/training',
      label: 'Skill & Training',
      description: 'Aptitude bootcamps and placement prep sessions',
      icon: GraduationCap,
    },
    {
      href: '/placements/mock-interviews',
      label: 'Mock Interviews',
      description: 'Schedule practice rounds with faculty mentors',
      icon: Users,
    },
    {
      href: '/placements/resumes',
      label: 'Resume Vault',
      description: 'Student digital resumes for corporate shortlists',
      icon: FileText,
    },
  ];

  return (
    <PlacementPageShell>
      <PlacementPageHeader
        title="Training & Placements ATS"
        description="Manage campus recruitment end-to-end — companies, eligibility drives, Kanban shortlists, and student notifications."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Partner companies', value: companyCount, icon: Building2 },
          { label: 'Total drives', value: driveCount, icon: Briefcase },
          { label: 'Active drives', value: activeDrives, icon: Kanban },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label} className="border-border/70 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className="h-5 w-5 text-sgvu-gold" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-black text-sgvu-navy">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="text-base">Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild className="bg-sgvu-gold text-sgvu-navy hover:bg-sgvu-gold/90">
              <Link href="/placements/companies">Add company</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/placements/drives">Create drive</Link>
            </Button>
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="text-base">Student-facing</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            New drives notify all students automatically. They apply from{' '}
            <span className="font-medium text-sgvu-navy">Placements Hub</span> with eligibility checks and pipeline tracking.
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map(({ href, label, description, icon: Icon }) => (
          <Link key={href} href={href} className="group">
            <Card className="h-full border-border/70 transition hover:border-sgvu-gold/50 hover:shadow-md">
              <CardContent className="flex h-full flex-col gap-3 p-5">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sgvu-gold/15 text-sgvu-navy transition group-hover:bg-sgvu-gold/25">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-bold text-sgvu-navy">{label}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                </div>
                <span className="mt-auto text-xs font-semibold text-sgvu-gold">Open module →</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </PlacementPageShell>
  );
}
