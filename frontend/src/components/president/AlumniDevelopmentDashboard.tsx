'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CircleDollarSign,
  FileText,
  Gauge,
  Globe2,
  HandCoins,
  Handshake,
  Lightbulb,
  MapPin,
  Mic2,
  Rocket,
  Sparkles,
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react';
import { ExecutiveCard } from '@/components/leadership/executive/ExecutiveCard';
import { ExecutiveExportButton } from '@/components/leadership/executive/ExecutiveExportButton';
import {
  EXECUTIVE_CARD,
  EXECUTIVE_SPACING,
  EXECUTIVE_TYPO,
} from '@/components/leadership/executive/design-tokens';
import { LeadershipPageHeader } from '@/components/leadership/LeadershipSectionCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuthedApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { DemoDataBanner } from './DemoDataBanner';

const AlumniDonationTrendChart = dynamic(
  () => import('./PresidentCharts').then((module) => module.AlumniDonationTrendChart),
  {
    ssr: false,
    loading: () => <div className="h-[300px] animate-pulse rounded-xl bg-slate-100" />,
  },
);

type Kpi = {
  label: string;
  value: string;
  trend: string;
  comparison: string;
  icon: LucideIcon;
};

const KPIS: Kpi[] = [
  { label: 'Total Alumni', value: '48,620', trend: '+8.4%', comparison: 'vs previous year', icon: Users },
  { label: 'Active Alumni', value: '31,480', trend: '+18.0%', comparison: 'vs previous year', icon: UserCheck },
  {
    label: 'Alumni in Top Companies',
    value: '8,940',
    trend: '+12.6%',
    comparison: 'vs previous year',
    icon: BriefcaseBusiness,
  },
  { label: 'Countries Represented', value: '52', trend: '+6', comparison: 'new countries this year', icon: Globe2 },
  { label: 'Alumni Entrepreneurs', value: '1,285', trend: '+14.2%', comparison: 'vs previous year', icon: Rocket },
  { label: 'Total Donations Received', value: '₹18.6 Cr', trend: '+22.4%', comparison: 'vs previous year', icon: HandCoins },
  { label: 'Average Annual Donation', value: '₹42,800', trend: '+9.7%', comparison: 'vs previous year', icon: CircleDollarSign },
  { label: 'Alumni Engagement Score', value: '84 / 100', trend: '+7 pts', comparison: 'vs previous year', icon: Gauge },
];

const EMPLOYERS = [
  { company: 'Google', alumni: 286, growth: 18 },
  { company: 'Microsoft', alumni: 264, growth: 16 },
  { company: 'Amazon', alumni: 338, growth: 21 },
  { company: 'Apple', alumni: 118, growth: 12 },
  { company: 'Meta', alumni: 96, growth: 15 },
  { company: 'Deloitte', alumni: 542, growth: 14 },
  { company: 'TCS', alumni: 1284, growth: 9 },
  { company: 'Infosys', alumni: 968, growth: 11 },
  { company: 'Accenture', alumni: 742, growth: 13 },
  { company: 'Goldman Sachs', alumni: 124, growth: 19 },
];

const COUNTRIES = [
  { country: 'India', alumni: 38_420, share: 79 },
  { country: 'United States', alumni: 2_460, share: 5.1 },
  { country: 'United Arab Emirates', alumni: 1_580, share: 3.2 },
  { country: 'United Kingdom', alumni: 1_240, share: 2.6 },
  { country: 'Canada', alumni: 1_085, share: 2.2 },
  { country: 'Australia', alumni: 760, share: 1.6 },
  { country: 'Singapore', alumni: 540, share: 1.1 },
  { country: 'Germany', alumni: 430, share: 0.9 },
  { country: 'Qatar', alumni: 360, share: 0.7 },
  { country: 'New Zealand', alumni: 285, share: 0.6 },
];

const MAP_MARKERS = [
  { label: 'North America', count: '3.5K', left: '18%', top: '35%' },
  { label: 'Europe', count: '2.1K', left: '48%', top: '28%' },
  { label: 'India', count: '38.4K', left: '66%', top: '48%' },
  { label: 'Middle East', count: '2.3K', left: '58%', top: '45%' },
  { label: 'Asia Pacific', count: '1.7K', left: '79%', top: '57%' },
];

const DONATION_METRICS = [
  { label: 'Total Donations', value: '₹18.6 Cr' },
  { label: 'Donations This Year', value: '₹4.8 Cr' },
  { label: 'Largest Donation', value: '₹1.25 Cr' },
  { label: 'Number of Donors', value: '4,346' },
  { label: 'Scholarship Contributions', value: '₹2.1 Cr' },
  { label: 'Infrastructure Contributions', value: '₹1.6 Cr' },
];

const DONATION_TREND = [
  { month: 'Apr', donations: 24 },
  { month: 'May', donations: 31 },
  { month: 'Jun', donations: 28 },
  { month: 'Jul', donations: 42 },
  { month: 'Aug', donations: 35 },
  { month: 'Sep', donations: 48 },
  { month: 'Oct', donations: 54 },
  { month: 'Nov', donations: 46 },
  { month: 'Dec', donations: 68 },
  { month: 'Jan', donations: 57 },
  { month: 'Feb', donations: 72 },
  { month: 'Mar', donations: 83 },
];

type DistinguishedAlumnus = {
  name: string;
  year: number;
  company: string;
  position: string;
  country: string;
  recognition: string;
};

const DISTINGUISHED_ALUMNI: DistinguishedAlumnus[] = [
  {
    name: 'Dr. Aditi Sharma',
    year: 2004,
    company: 'Google',
    position: 'VP, AI Research',
    country: 'United States',
    recognition: 'Global AI Leadership Award',
  },
  {
    name: 'Rohan Mehta',
    year: 2007,
    company: 'Microsoft',
    position: 'Regional Director',
    country: 'Singapore',
    recognition: 'Asia Technology Leader',
  },
  {
    name: 'Neha Rathore',
    year: 2010,
    company: 'GreenGrid Labs',
    position: 'Founder & CEO',
    country: 'India',
    recognition: 'Forbes India 40 Under 40',
  },
  {
    name: 'Arjun Kapoor',
    year: 2002,
    company: 'Goldman Sachs',
    position: 'Managing Director',
    country: 'United Kingdom',
    recognition: 'Finance Excellence Medal',
  },
  {
    name: 'Dr. Priya Nair',
    year: 2008,
    company: 'Global Health Alliance',
    position: 'Chief Scientist',
    country: 'Canada',
    recognition: 'International Research Fellow',
  },
  {
    name: 'Vikram Singh',
    year: 2012,
    company: 'Amazon',
    position: 'Director, Operations',
    country: 'United Arab Emirates',
    recognition: 'Supply Chain Innovator',
  },
];

const ENGAGEMENT = [
  { label: 'Event Participation', value: 74, count: '12,840 alumni', icon: CalendarDays },
  { label: 'Mentorship Program', value: 68, count: '3,260 mentors', icon: Handshake },
  { label: 'Guest Lectures', value: 82, count: '486 sessions', icon: Mic2 },
  { label: 'Internship Support', value: 71, count: '1,940 opportunities', icon: BriefcaseBusiness },
  { label: 'Startup Mentorship', value: 63, count: '728 founders engaged', icon: Lightbulb },
];

function AlumniKpiCard({ kpi }: { kpi: Kpi }) {
  const Icon = kpi.icon;
  return (
    <article className={cn(EXECUTIVE_CARD, 'group p-5 transition hover:-translate-y-0.5 hover:border-sgvu-gold/40')}>
      <div className="flex items-start justify-between gap-3">
        <p className={EXECUTIVE_TYPO.cardTitle}>{kpi.label}</p>
        <div className="rounded-xl bg-sgvu-navy/5 p-2.5 text-sgvu-navy transition group-hover:bg-sgvu-gold/15">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>
      <p className="mt-4 font-mono text-2xl font-black tabular-nums text-sgvu-navy xl:text-3xl">{kpi.value}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
          <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
          {kpi.trend}
        </span>
        <span className="text-muted-foreground">{kpi.comparison}</span>
      </div>
    </article>
  );
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

type ApiAlumniDevelopment = {
  active_alumni?: number;
  funds_raised_fy?: number;
  donations_by_year?: Array<{ year: number; total: number }>;
  distinguished_alumni?: Array<{
    name: string;
    graduation_year: number;
    company: string;
    position: string;
  }>;
};

function formatInrCompactValue(value: number): string {
  if (value >= 1e7) return `₹${(value / 1e7).toFixed(1)} Cr`;
  if (value >= 1e5) return `₹${(value / 1e5).toFixed(1)} L`;
  return `₹${value.toLocaleString('en-IN')}`;
}

export function AlumniDevelopmentDashboard() {
  const api = useAuthedApi();
  const [profileAlumnus, setProfileAlumnus] = useState<DistinguishedAlumnus | null>(null);
  const [usingSmokeData, setUsingSmokeData] = useState(true);
  const [kpis, setKpis] = useState<Kpi[]>(KPIS);
  const [alumni, setAlumni] = useState<DistinguishedAlumnus[]>(DISTINGUISHED_ALUMNI);
  const [donationTrend, setDonationTrend] = useState(DONATION_TREND);

  useEffect(() => {
    void (async () => {
      try {
        const data = await api.get<ApiAlumniDevelopment>('/api/president/alumni-development');
        const liveAlumni = data?.distinguished_alumni ?? [];
        const meaningful = Number(data?.active_alumni ?? 0) > 0 || liveAlumni.length > 0;
        if (!meaningful) return;

        setKpis((prev) =>
          prev.map((kpi) => {
            if (kpi.label === 'Active Alumni' && Number(data?.active_alumni ?? 0) > 0) {
              return {
                ...kpi,
                value: Number(data?.active_alumni ?? 0).toLocaleString('en-IN'),
                trend: 'Live',
                comparison: 'verified alumni profiles',
              };
            }
            if (
              kpi.label === 'Total Donations Received' &&
              Number(data?.funds_raised_fy ?? 0) > 0
            ) {
              return {
                ...kpi,
                value: formatInrCompactValue(Number(data?.funds_raised_fy ?? 0)),
                trend: 'Live',
                comparison: 'raised this financial year',
              };
            }
            return kpi;
          }),
        );

        if (liveAlumni.length > 0) {
          setAlumni(
            liveAlumni.map((row) => ({
              name: row.name,
              year: row.graduation_year,
              company: row.company,
              position: row.position,
              country: '—',
              recognition: '',
            })),
          );
        }

        const liveDonations = data?.donations_by_year ?? [];
        if (liveDonations.length > 0) {
          setDonationTrend(
            liveDonations.map((row) => ({
              month: String(row.year),
              donations: Math.round(row.total / 1e5),
            })),
          );
        }

        setUsingSmokeData(false);
      } catch {
        // Keep the demo dataset when the endpoint is unavailable.
      }
    })();
  }, [api]);

  return (
    <div className={EXECUTIVE_SPACING.page}>
      <LeadershipPageHeader
        eyebrow="Falcon Workspace"
        title="Alumni & Development"
        description="Monitor alumni achievements, global presence, industry engagement, and philanthropic contributions to strengthen the university's reputation and growth."
      />

      {usingSmokeData && (
        <DemoDataBanner message="Showing demo alumni analytics for portal testing (live alumni data was empty)." />
      )}

      <main id="alumni-development-report" className="space-y-8">
        <section aria-label="Alumni executive key performance indicators" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((kpi) => (
            <AlumniKpiCard key={kpi.label} kpi={kpi} />
          ))}
        </section>

        <ExecutiveCard
          id="alumni-employment"
          title="Alumni Employment"
          description="Global employers with the strongest SGVU alumni presence"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {EMPLOYERS.map((employer) => (
              <article
                key={employer.company}
                className="rounded-xl border border-sgvu-navy/10 bg-slate-50/60 p-4 transition hover:border-sgvu-gold/50 hover:bg-white"
              >
                <div className="flex items-start justify-between gap-3">
                  <div
                    className="flex h-11 w-11 items-center justify-center rounded-xl bg-sgvu-navy text-sm font-black text-white"
                    aria-label={`${employer.company} logo placeholder`}
                  >
                    {employer.company.slice(0, 2).toUpperCase()}
                  </div>
                  <Badge variant="success">+{employer.growth}%</Badge>
                </div>
                <h3 className="mt-4 font-bold text-sgvu-navy">{employer.company}</h3>
                <p className="mt-1 font-mono text-2xl font-black text-sgvu-navy">{employer.alumni}</p>
                <p className="text-xs text-muted-foreground">alumni · growth vs last year</p>
              </article>
            ))}
          </div>
        </ExecutiveCard>

        <ExecutiveCard
          title="Global Alumni Map"
          description="Alumni reach across 52 countries and major international regions"
        >
          <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
            <div className="relative min-h-[360px] overflow-hidden rounded-2xl border border-sgvu-navy/10 bg-sgvu-navy">
              <Globe2
                className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 text-white/10"
                strokeWidth={0.8}
                aria-hidden="true"
              />
              <div className="absolute inset-x-6 top-5 flex items-center justify-between text-white">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sgvu-gold">Global reach</p>
                  <p className="mt-1 text-2xl font-black">52 countries</p>
                </div>
                <MapPin className="h-6 w-6 text-sgvu-gold" aria-hidden="true" />
              </div>
              {MAP_MARKERS.map((marker) => (
                <div
                  key={marker.label}
                  className="absolute -translate-x-1/2 -translate-y-1/2 text-center"
                  style={{ left: marker.left, top: marker.top }}
                >
                  <span className="mx-auto block h-3 w-3 rounded-full border-2 border-white bg-sgvu-gold ring-4 ring-sgvu-gold/20" />
                  <span className="mt-2 block whitespace-nowrap rounded-lg bg-white/95 px-2 py-1 text-[11px] font-semibold text-sgvu-navy">
                    {marker.label} · {marker.count}
                  </span>
                </div>
              ))}
              <p className="absolute bottom-4 left-5 text-xs text-white/60">
                Executive distribution view · markers show regional concentration
              </p>
            </div>

            <div>
              <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-sgvu-navy">Top 10 countries</h3>
              <ol className="mt-4 space-y-2.5">
                {COUNTRIES.map((country, index) => (
                  <li key={country.country} className="flex items-center gap-3">
                    <span className="w-5 text-right font-mono text-xs text-muted-foreground">{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate font-medium text-sgvu-navy">{country.country}</span>
                        <span className="font-mono font-bold text-sgvu-navy">
                          {country.alumni.toLocaleString('en-IN')}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-sgvu-gold"
                          style={{ width: `${Math.max(country.share, 4)}%` }}
                        />
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </ExecutiveCard>

        <ExecutiveCard
          id="alumni-donations"
          title="Alumni Donations"
          description="Fundraising momentum, donor participation, and strategic allocation"
        >
          <div className="grid gap-6 xl:grid-cols-[0.9fr_1.6fr]">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
              {DONATION_METRICS.map((metric) => (
                <div key={metric.label} className="rounded-xl border border-sgvu-navy/10 bg-slate-50/60 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{metric.label}</p>
                  <p className="mt-2 font-mono text-xl font-black text-sgvu-navy">{metric.value}</p>
                </div>
              ))}
            </div>
            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-sgvu-navy">Monthly donation trend</p>
                <Badge variant="success">12% above target</Badge>
              </div>
              <AlumniDonationTrendChart data={donationTrend} />
            </div>
          </div>
        </ExecutiveCard>

        <ExecutiveCard
          id="distinguished-alumni"
          title="Top Distinguished Alumni"
          description="Leadership, innovation, and global recognition across the alumni network"
        >
          <div className="overflow-x-auto">
            {/* aria-label instead of sr-only <caption>: absolutely-positioned captions escape
                the table in Chromium and stretch the document, creating blank scroll space. */}
            <table
              className="w-full min-w-[980px] text-left text-sm"
              aria-label="Distinguished alumni and their professional recognition"
            >
              <thead className="border-b border-sgvu-navy/10 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left font-bold">Alumni Name</th>
                  <th scope="col" className="w-36 px-4 py-3 text-center font-bold">Graduation Year</th>
                  <th scope="col" className="px-4 py-3 text-left font-bold">Company</th>
                  <th scope="col" className="px-4 py-3 text-left font-bold">Position</th>
                  <th scope="col" className="w-40 px-4 py-3 text-left font-bold">Country</th>
                  <th scope="col" className="px-4 py-3 text-left font-bold">Recognition</th>
                  <th scope="col" className="w-40 px-4 py-3 text-center font-bold">Action</th>
                </tr>
              </thead>
              <tbody>
                {alumni.map((alumnus) => (
                  <tr key={alumnus.name} className="border-b border-sgvu-navy/5 last:border-0 hover:bg-slate-50/80">
                    <td className="px-4 py-3.5 text-left font-semibold text-sgvu-navy">{alumnus.name}</td>
                    <td className="px-4 py-3.5 text-center font-mono tabular-nums">{alumnus.year}</td>
                    <td className="px-4 py-3.5 text-left">{alumnus.company}</td>
                    <td className="px-4 py-3.5 text-left text-muted-foreground">{alumnus.position}</td>
                    <td className="px-4 py-3.5 text-left">{alumnus.country}</td>
                    <td className="px-4 py-3.5 text-left">
                      {alumnus.recognition ? (
                        <Badge variant="outline" className="border-sgvu-gold/40 bg-sgvu-gold/10 text-sgvu-navy">
                          {alumnus.recognition}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-center align-middle">
                      <Button
                        type="button"
                        size="sm"
                        className="h-9 w-32 cursor-pointer justify-center whitespace-nowrap rounded-lg bg-[#0B2447] px-3 font-semibold text-white transition-colors hover:bg-[#123A6D] active:bg-sgvu-gold active:text-sgvu-navy focus-visible:ring-2 focus-visible:ring-sgvu-gold focus-visible:ring-offset-2"
                        onClick={() => setProfileAlumnus(alumnus)}
                      >
                        View Profile
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ExecutiveCard>

        <ExecutiveCard
          title="Alumni Engagement"
          description="Participation across the university's highest-impact alumni initiatives"
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {ENGAGEMENT.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.label} className="rounded-xl border border-sgvu-navy/10 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="rounded-lg bg-sgvu-navy/5 p-2 text-sgvu-navy">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <span className="font-mono text-lg font-black text-sgvu-navy">{item.value}%</span>
                  </div>
                  <h3 className="mt-3 text-sm font-semibold text-sgvu-navy">{item.label}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{item.count}</p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-sgvu-gold" style={{ width: `${item.value}%` }} />
                  </div>
                </article>
              );
            })}
          </div>
        </ExecutiveCard>

        <section
          className={cn(
            EXECUTIVE_CARD,
            'overflow-hidden border-sgvu-gold/30 bg-gradient-to-r from-sgvu-navy to-[#123a6d] p-6 text-white md:p-8',
          )}
        >
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-sgvu-gold p-3 text-sgvu-navy">
              <Sparkles className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-sgvu-gold">Executive AI Insights</p>
              <h2 className="mt-2 text-xl font-black">President&apos;s Alumni Development Brief</h2>
              <p className="mt-4 max-w-5xl text-sm leading-7 text-blue-50">
                Alumni engagement increased by 18% this year. Google and Microsoft hired 42 new graduates.
                International alumni presence expanded to 52 countries. Donations exceeded annual targets by 12%.
                <span className="font-semibold text-white">
                  {' '}Recommendation: strengthen engagement with alumni in North America and increase corporate
                  networking events.
                </span>
              </p>
            </div>
          </div>
        </section>

        <ExecutiveCard title="Executive Actions" description="Strategic alumni intelligence and report shortcuts">
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="outline" onClick={() => scrollToSection('distinguished-alumni')}>
              <Users className="h-4 w-4" aria-hidden="true" />
              View Alumni Directory
            </Button>
            <ExecutiveExportButton
              targetId="alumni-development-report"
              filename="alumni-development-report"
              label="Generate Alumni Report"
            />
            <Button type="button" variant="outline" onClick={() => scrollToSection('alumni-donations')}>
              <BarChart3 className="h-4 w-4" aria-hidden="true" />
              View Donation Analytics
            </Button>
            <Button type="button" variant="outline" onClick={() => scrollToSection('alumni-employment')}>
              <Building2 className="h-4 w-4" aria-hidden="true" />
              Corporate Partnership Report
            </Button>
            <ExecutiveExportButton
              targetId="alumni-development-report"
              filename="president-alumni-executive-report"
              label="Export Executive Report"
            />
          </div>
          <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            Exports include the current executive snapshot, strategic insights, and all dashboard sections.
          </p>
        </ExecutiveCard>
      </main>

      <Dialog
        open={profileAlumnus !== null}
        onOpenChange={(open) => {
          if (!open) setProfileAlumnus(null);
        }}
      >
        <DialogContent className="max-w-lg overflow-hidden p-0 sm:rounded-2xl" hideCloseButton>
          {profileAlumnus ? (
            <div>
              {/* Navy hero header */}
              <div className="relative bg-[linear-gradient(135deg,#08234a_0%,#0B2447_55%,#123A6D_100%)] px-6 pb-6 pt-8 text-white">
                <div className="absolute right-0 top-0 h-28 w-28 rounded-full bg-sgvu-gold/10 blur-2xl" aria-hidden="true" />
                <DialogHeader className="relative items-center gap-3 text-center sm:items-start sm:text-left">
                  <div className="flex w-full flex-col items-center gap-4 sm:flex-row sm:items-start">
                    <span
                      aria-hidden="true"
                      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-sgvu-gold/60 bg-white/10 font-mono text-xl font-black text-sgvu-gold shadow-lg backdrop-blur-sm"
                    >
                      {profileAlumnus.name
                        .replace(/^Dr\.\s*/i, '')
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((part) => part[0]?.toUpperCase() ?? '')
                        .join('')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sgvu-gold/90">
                        Distinguished Alumnus
                      </p>
                      <DialogTitle className="mt-1 text-2xl font-black tracking-tight text-white">
                        {profileAlumnus.name}
                      </DialogTitle>
                      <DialogDescription className="mt-1 text-sm text-blue-100/85">
                        {profileAlumnus.position} at {profileAlumnus.company}
                      </DialogDescription>
                    </div>
                  </div>
                </DialogHeader>
              </div>

              {/* Recognition highlight */}
              {profileAlumnus.recognition ? (
                <div className="border-b border-sgvu-navy/10 bg-sgvu-gold/10 px-6 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Recognition
                  </p>
                  <p className="mt-0.5 text-sm font-bold text-sgvu-navy">{profileAlumnus.recognition}</p>
                </div>
              ) : null}

              {/* Compact 2×2 detail grid */}
              <div className="grid grid-cols-2 gap-3 p-5">
                <div className="rounded-xl border border-sgvu-navy/10 bg-slate-50/80 p-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    Graduation Year
                  </p>
                  <p className="mt-1.5 font-mono text-xl font-black tabular-nums text-sgvu-navy">
                    {profileAlumnus.year}
                  </p>
                </div>
                <div className="rounded-xl border border-sgvu-navy/10 bg-slate-50/80 p-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    Country
                  </p>
                  <p className="mt-1.5 text-base font-bold text-sgvu-navy">{profileAlumnus.country}</p>
                </div>
                <div className="rounded-xl border border-sgvu-navy/10 bg-slate-50/80 p-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    Company
                  </p>
                  <p className="mt-1.5 text-base font-bold text-sgvu-navy">{profileAlumnus.company}</p>
                </div>
                <div className="rounded-xl border border-sgvu-navy/10 bg-slate-50/80 p-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    Position
                  </p>
                  <p className="mt-1.5 text-base font-bold leading-snug text-sgvu-navy">
                    {profileAlumnus.position}
                  </p>
                </div>
              </div>

              {/* Footer actions */}
              <div className="flex items-center justify-end gap-2 border-t border-sgvu-navy/10 bg-white px-5 py-4">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9 border-sgvu-navy/20 font-semibold text-sgvu-navy"
                  onClick={() => setProfileAlumnus(null)}
                >
                  Close
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-9 justify-center rounded-lg bg-[#0B2447] px-4 font-semibold text-white transition-colors hover:bg-[#123A6D] active:bg-sgvu-gold active:text-sgvu-navy focus-visible:ring-2 focus-visible:ring-sgvu-gold focus-visible:ring-offset-2"
                  onClick={() => setProfileAlumnus(null)}
                >
                  Done
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
