'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  BookOpen,
  Building2,
  GraduationCap,
  Loader2,
  MapPin,
  RefreshCw,
  UserRound,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';
import { cn } from '@/lib/utils';

type CampusProfileRow = {
  campus_id: number;
  campus_name: string;
  campus_code?: string | null;
  address?: string | null;
  university_name?: string | null;
  university_logo_url?: string | null;
};

type CampusStats = {
  students: number;
  facultyStaff: number;
  departments: number;
  programs: number;
};

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'CA';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function FieldRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  const shown = value?.trim();
  return (
    <div className="grid gap-1 px-4 py-3.5 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)] sm:items-start sm:gap-6">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn('text-sm', shown ? 'font-medium text-sgvu-navy' : 'text-muted-foreground')}>
        {shown || 'Not recorded'}
      </span>
    </div>
  );
}

function SectionList({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-sgvu-navy/10 bg-white">
      {children}
    </div>
  );
}

export function CampusAdminProfilePage() {
  const api = useAuthedApi();
  const [campuses, setCampuses] = useState<CampusProfileRow[] | null>(null);
  const [stats, setStats] = useState<CampusStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [profileRows, studentRows, facultyRows, departmentRows, programRows] =
        await Promise.all([
          api.get<unknown>('/api/campus-admin/profile'),
          api.get<unknown>('/api/campus-admin/students').catch(() => null),
          api.get<unknown>('/api/campus-admin/faculty-staff').catch(() => null),
          api.get<unknown>('/api/campus-admin/departments').catch(() => null),
          api.get<unknown>('/api/campus-admin/programs').catch(() => null),
        ]);

      const rows = asArray<CampusProfileRow>(profileRows);
      setCampuses(rows);

      const nextStats: CampusStats = {
        students: Array.isArray(studentRows) ? studentRows.length : -1,
        facultyStaff: Array.isArray(facultyRows) ? facultyRows.length : -1,
        departments: Array.isArray(departmentRows) ? departmentRows.length : -1,
        programs: Array.isArray(programRows) ? programRows.length : -1,
      };
      const hasAnyStat = Object.values(nextStats).some((value) => value >= 0);
      setStats(hasAnyStat ? nextStats : null);
    } catch (err: unknown) {
      setCampuses(null);
      setStats(null);
      setError(
        err instanceof Error ? err.message : 'Unable to load campus profile.',
      );
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const campus = campuses?.[0];
  const extraCampuses = campuses?.slice(1) ?? [];

  return (
    <div className="space-y-6 p-6">
      <Card className="overflow-hidden border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">
            Falcon Workspace · Campus Admin
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-sgvu-navy">
            Campus Profile
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your campus information and official details
          </p>
        </CardContent>
      </Card>

      {loading ? (
        <Card className="border-sgvu-navy/10 bg-white shadow-sm">
          <CardContent className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Campus profile information loading...
          </CardContent>
        </Card>
      ) : error ? (
        <Card className="border-destructive/20 bg-white shadow-sm">
          <CardContent className="space-y-4 py-8">
            <p className="text-sm text-destructive">Unable to load campus profile.</p>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button type="button" variant="outline" onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : !campus ? (
        <Card className="border-sgvu-navy/10 bg-white shadow-sm">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Campus profile information is not available.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="border-sgvu-navy/10 bg-white shadow-sm">
            <CardContent className="flex flex-col gap-5 p-5 md:flex-row md:items-start md:justify-between md:p-6">
              <div className="flex min-w-0 items-start gap-4">
                <Avatar className="h-16 w-16 rounded-2xl border border-sgvu-navy/10">
                  {campus.university_logo_url ? (
                    <AvatarImage
                      src={campus.university_logo_url}
                      alt={campus.campus_name}
                      className="rounded-2xl object-cover"
                    />
                  ) : null}
                  <AvatarFallback className="rounded-2xl bg-sgvu-navy/5 text-base text-sgvu-navy">
                    {initials(campus.campus_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 space-y-2">
                  <h2 className="text-xl font-bold tracking-tight text-sgvu-navy">
                    {campus.campus_name}
                  </h2>
                  <div className="flex flex-wrap items-center gap-2">
                    {campus.campus_code ? (
                      <p className="text-sm text-muted-foreground">
                        Campus Code: {campus.campus_code}
                      </p>
                    ) : null}
                    <Badge variant="success">Active</Badge>
                  </div>
                  {campus.address?.trim() ? (
                    <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-sgvu-gold" />
                      <span>{campus.address}</span>
                    </p>
                  ) : null}
                </div>
              </div>
              <Badge variant="outline" className="w-fit shrink-0 border-sgvu-navy/20 text-sgvu-navy">
                View only
              </Badge>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-sgvu-navy/10 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Basic Information</CardTitle>
              </CardHeader>
              <CardContent>
                <SectionList>
                  <FieldRow label="Campus Name" value={campus.campus_name} />
                  <FieldRow label="Campus Code" value={campus.campus_code} />
                  <FieldRow label="Status" value="Active" />
                  <FieldRow
                    label="University / Institution"
                    value={campus.university_name}
                  />
                  {extraCampuses.length ? (
                    <FieldRow
                      label="Additional assigned campuses"
                      value={extraCampuses.map((row) => row.campus_name).join(', ')}
                    />
                  ) : null}
                </SectionList>
              </CardContent>
            </Card>

            <Card className="border-sgvu-navy/10 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Address</CardTitle>
              </CardHeader>
              <CardContent>
                <SectionList>
                  <FieldRow label="Address" value={campus.address} />
                </SectionList>
              </CardContent>
            </Card>
          </div>

          {stats ? (
            <section aria-label="Campus statistics">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {stats.students >= 0 ? (
                  <StatCard
                    title="Total Students"
                    value={stats.students}
                    icon={GraduationCap}
                  />
                ) : null}
                {stats.facultyStaff >= 0 ? (
                  <StatCard
                    title="Faculty & Staff"
                    value={stats.facultyStaff}
                    icon={UserRound}
                  />
                ) : null}
                {stats.departments >= 0 ? (
                  <StatCard
                    title="Departments"
                    value={stats.departments}
                    icon={Building2}
                  />
                ) : null}
                {stats.programs >= 0 ? (
                  <StatCard
                    title="Programs"
                    value={stats.programs}
                    icon={BookOpen}
                  />
                ) : null}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: number;
  icon: typeof GraduationCap;
}) {
  return (
    <Card className="border-sgvu-navy/10 bg-white shadow-sm">
      <CardContent className="flex items-center justify-between gap-3 p-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {title}
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-sgvu-navy">
            {value.toLocaleString('en-IN')}
          </p>
        </div>
        <div className="rounded-xl bg-sgvu-navy/5 p-2.5 text-sgvu-navy">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}
