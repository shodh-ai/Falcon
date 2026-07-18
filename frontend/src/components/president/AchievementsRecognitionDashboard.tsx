'use client';

import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Award,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  Download,
  FileText,
  FlaskConical,
  Globe2,
  GraduationCap,
  HandCoins,
  Lightbulb,
  Medal,
  Mic2,
  Rocket,
  Share2,
  Sparkles,
  Trophy,
  TrendingUp,
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuthedApi } from '@/lib/api';
import { toast } from '@/lib/notifications/falcon-toast';
import { cn } from '@/lib/utils';
import { DemoDataBanner } from './DemoDataBanner';

type Kpi = {
  label: string;
  value: string;
  trend: string;
  comparison: string;
  icon: LucideIcon;
};

type Priority = 'Critical' | 'High' | 'Strategic';

const KPIS: Kpi[] = [
  { label: 'Total Achievements', value: '342', trend: '+34', comparison: 'this month vs last', icon: Trophy },
  { label: 'Student Awards', value: '128', trend: '+18%', comparison: 'vs previous period', icon: GraduationCap },
  { label: 'Faculty Awards', value: '64', trend: '+12%', comparison: 'vs previous period', icon: Award },
  { label: 'Research Publications', value: '486', trend: '+18%', comparison: 'vs previous period', icon: BookOpen },
  { label: 'National Recognitions', value: '52', trend: '+9', comparison: 'vs previous period', icon: Medal },
  { label: 'International Recognitions', value: '27', trend: '+6', comparison: 'vs previous period', icon: Globe2 },
  { label: 'Sports Medals', value: '89', trend: '+14%', comparison: 'vs previous period', icon: Trophy },
  { label: 'Government Grants', value: '₹8.4 Cr', trend: '+22%', comparison: 'vs previous period', icon: HandCoins },
];

const TIMELINE: Array<{
  icon: LucideIcon;
  category: string;
  subject: string;
  description: string;
  date: string;
  priority: Priority;
}> = [
  {
    icon: Medal,
    category: 'Sports',
    subject: 'Rahul Sharma (B.Tech CSE)',
    description: 'Won Gold Medal in State Level Sports Championship.',
    date: '12 Jul 2026',
    priority: 'High',
  },
  {
    icon: BookOpen,
    category: 'Research',
    subject: 'Dr. A.K. Sharma',
    description: 'Published an internationally recognized research book.',
    date: '08 Jul 2026',
    priority: 'Strategic',
  },
  {
    icon: Trophy,
    category: 'Innovation',
    subject: 'Computer Science Department',
    description: 'Received National Innovation Award.',
    date: '02 Jul 2026',
    priority: 'Critical',
  },
  {
    icon: Globe2,
    category: 'Partnerships',
    subject: 'University',
    description: 'Signed International MoU with XYZ University.',
    date: '28 Jun 2026',
    priority: 'Strategic',
  },
  {
    icon: GraduationCap,
    category: 'Student Excellence',
    subject: 'MBA Students',
    description: 'Won National Business Case Competition.',
    date: '22 Jun 2026',
    priority: 'High',
  },
  {
    icon: FlaskConical,
    category: 'Research Grants',
    subject: 'Research Team',
    description: 'Received Government Research Grant.',
    date: '15 Jun 2026',
    priority: 'Critical',
  },
];

const CATEGORIES: Array<{ label: string; count: number; icon: LucideIcon }> = [
  { label: 'Student Excellence', count: 128, icon: GraduationCap },
  { label: 'Faculty Excellence', count: 64, icon: Award },
  { label: 'Research', count: 86, icon: FlaskConical },
  { label: 'Innovation', count: 41, icon: Lightbulb },
  { label: 'Sports', count: 89, icon: Trophy },
  { label: 'Placements', count: 37, icon: BriefcaseBusiness },
  { label: 'Rankings', count: 18, icon: Medal },
  { label: 'Community Outreach', count: 29, icon: Users },
];

const RANKINGS = [
  { body: 'NIRF', current: 'Rank 68', previous: 'Rank 79', delta: '+11', status: 'Improved' },
  { body: 'NAAC', current: 'A++', previous: 'A+', delta: 'Grade up', status: 'Improved' },
  { body: 'NBA', current: '5 Programmes', previous: '3 Programmes', delta: '+2', status: 'Expanded' },
  { body: 'QS Ranking', current: 'Band 501–550', previous: 'Band 551–600', delta: 'Up one band', status: 'Improved' },
  { body: 'Times Higher Education', current: 'Asia Top 250', previous: 'Asia Top 300', delta: 'Entered Top 250', status: 'Improved' },
];

const DEPARTMENTS = [
  { department: 'Computer Science', achievements: 54, research: 112, awards: 18, score: 94, status: 'Leading' },
  { department: 'Management Studies', achievements: 41, research: 68, awards: 14, score: 88, status: 'Strong' },
  { department: 'Pharmacy', achievements: 36, research: 74, awards: 11, score: 85, status: 'Strong' },
  { department: 'Engineering — ECE', achievements: 33, research: 59, awards: 9, score: 81, status: 'Growing' },
  { department: 'Law', achievements: 28, research: 42, awards: 8, score: 78, status: 'Growing' },
  { department: 'Arts & Humanities', achievements: 24, research: 37, awards: 7, score: 74, status: 'Steady' },
];

const RESEARCH_METRICS = [
  { label: 'Latest Publications', value: '68', sub: 'this quarter', icon: BookOpen },
  { label: 'Patents', value: '14', sub: 'filed / granted', icon: Lightbulb },
  { label: 'Research Grants', value: '₹8.4 Cr', sub: 'active funding', icon: HandCoins },
  { label: 'Startups', value: '22', sub: 'incubated ventures', icon: Rocket },
  { label: 'Innovation Projects', value: '47', sub: 'in progress', icon: FlaskConical },
  { label: 'International Collaborations', value: '19', sub: 'active MoUs', icon: Globe2 },
];

const SPORTS_CULTURAL = [
  { label: 'National Medals', value: '34', icon: Medal },
  { label: 'State Medals', value: '55', icon: Trophy },
  { label: 'International Competitions', value: '8', icon: Globe2 },
  { label: 'Cultural Festivals', value: '12', icon: Mic2 },
  { label: 'Hackathons', value: '21', icon: Lightbulb },
  { label: 'Technical Competitions', value: '29', icon: FlaskConical },
];

const SUCCESS_STORIES = [
  {
    headline: 'CSE Team Wins National Innovation Award',
    summary:
      'A multidisciplinary student–faculty team delivered an AI-assisted campus sustainability platform recognized at the National Innovation Summit.',
    department: 'Computer Science',
    date: '02 Jul 2026',
  },
  {
    headline: 'MBA Cohort Claims Business Case Crown',
    summary:
      'SGVU MBA finalists outperformed 180 national teams with a turnaround strategy for a mid-market manufacturing enterprise.',
    department: 'Management Studies',
    date: '22 Jun 2026',
  },
  {
    headline: 'Pharmacy Faculty Secures Major Research Grant',
    summary:
      'Government-backed funding will expand pharmaceutical formulation research and doctoral capacity over the next three years.',
    department: 'Pharmacy',
    date: '15 Jun 2026',
  },
];

const PRIORITY_STYLES: Record<Priority, string> = {
  Critical: 'border-red-200 bg-red-50 text-red-800',
  High: 'border-amber-200 bg-amber-50 text-amber-900',
  Strategic: 'border-sky-200 bg-sky-50 text-sky-900',
};

const STATUS_STYLES: Record<string, string> = {
  Leading: 'bg-emerald-100 text-emerald-800',
  Strong: 'bg-sky-100 text-sky-800',
  Growing: 'bg-amber-100 text-amber-900',
  Steady: 'bg-slate-100 text-slate-700',
};

function AchievementKpiCard({ kpi }: { kpi: Kpi }) {
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

type TimelineItem = (typeof TIMELINE)[number];
type RankingRow = (typeof RANKINGS)[number];
type SuccessStory = (typeof SUCCESS_STORIES)[number];

type ApiAchievements = {
  rankings?: Array<{ body: string; year: string; score: number; band: string }>;
  degree_awards_total?: number;
  recent_achievements?: Array<{
    title: string;
    issuer: string;
    student: string;
    department: string;
    date: string;
  }>;
};

const HIGHLIGHTS_SUMMARY = [
  'SGVU University Highlights',
  '- 342 total achievements recorded this academic year',
  '- NIRF rank improved to 68 (up 11 places); NAAC grade A++',
  '- 486 research publications, 14 patents, ₹8.4 Cr in active grants',
  '- 89 sports medals including 34 national medals',
  'Full report: President Portal → Achievements & Recognition',
].join('\n');

export function AchievementsRecognitionDashboard() {
  const api = useAuthedApi();
  const [usingSmokeData, setUsingSmokeData] = useState(true);
  const [timeline, setTimeline] = useState<TimelineItem[]>(TIMELINE);
  const [rankings, setRankings] = useState<RankingRow[]>(RANKINGS);
  const [storyDetail, setStoryDetail] = useState<SuccessStory | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const data = await api.get<ApiAchievements>('/api/president/achievements');
        const liveTimeline = data?.recent_achievements ?? [];
        const liveRankings = data?.rankings ?? [];
        if (liveTimeline.length === 0 && liveRankings.length === 0) return;

        if (liveTimeline.length > 0) {
          setTimeline(
            liveTimeline.map((item) => ({
              icon: Award,
              category: item.department || 'Student Excellence',
              subject: item.student,
              description: `${item.title}${item.issuer ? ` — ${item.issuer}` : ''}`,
              date: item.date
                ? new Date(item.date).toLocaleDateString(undefined, {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })
                : '',
              priority: 'High' as Priority,
            })),
          );
        }
        if (liveRankings.length > 0) {
          setRankings(
            liveRankings.map((rank) => ({
              body: rank.body,
              current: rank.band || `Score ${rank.score.toFixed(1)}`,
              previous: `Cycle ${rank.year}`,
              delta: 'Live',
              status: 'Tracked',
            })),
          );
        }
        setUsingSmokeData(false);
      } catch {
        // Keep the demo dataset when the endpoint is unavailable.
      }
    })();
  }, [api]);

  const shareHighlights = async () => {
    try {
      await navigator.clipboard.writeText(HIGHLIGHTS_SUMMARY);
      toast.success('University highlights copied to clipboard — ready to share.');
    } catch {
      toast.error('Could not access the clipboard. Copy the highlights manually.');
    }
  };

  return (
    <div className={EXECUTIVE_SPACING.page}>
      <LeadershipPageHeader
        eyebrow="Falcon Workspace"
        title="Achievements & Recognition"
        description="Monitor the university's latest accomplishments, awards, research milestones, rankings, and success stories to showcase institutional excellence."
      />

      {usingSmokeData && (
        <DemoDataBanner message="Showing demo achievements data for portal testing (live achievement records were empty)." />
      )}

      <main id="achievements-recognition-report" className="space-y-8">
        <section
          aria-label="Achievement key performance indicators"
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          {KPIS.map((kpi) => (
            <AchievementKpiCard key={kpi.label} kpi={kpi} />
          ))}
        </section>

        <ExecutiveCard
          id="latest-achievements"
          title="Latest Achievements"
          description="Recent institutional milestones ready for accreditation, media, and visitor briefings"
        >
          <ol className="relative space-y-0 border-l border-sgvu-navy/15 pl-6">
            {timeline.map((item) => {
              const Icon = item.icon;
              return (
                <li key={`${item.subject}-${item.date}`} className="relative pb-8 last:pb-0">
                  <span className="absolute -left-[37px] flex h-9 w-9 items-center justify-center rounded-full border border-sgvu-gold/40 bg-white text-sgvu-navy shadow-sm">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="rounded-xl border border-sgvu-navy/10 bg-slate-50/50 p-4 transition hover:border-sgvu-gold/40 hover:bg-white">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="border-sgvu-navy/15 text-sgvu-navy">
                        {item.category}
                      </Badge>
                      <Badge variant="outline" className={PRIORITY_STYLES[item.priority]}>
                        {item.priority}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{item.date}</span>
                    </div>
                    <h3 className="mt-2 font-bold text-sgvu-navy">{item.subject}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </ExecutiveCard>

        <ExecutiveCard title="Achievement Categories" description="Distribution of excellence across strategic pillars">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {CATEGORIES.map((category) => {
              const Icon = category.icon;
              return (
                <article
                  key={category.label}
                  className="rounded-xl border border-sgvu-navy/10 bg-white p-4 text-sgvu-navy transition hover:-translate-y-0.5 hover:border-sgvu-gold/40 hover:shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                    <span className="font-mono text-xl font-black">{category.count}</span>
                  </div>
                  <h3 className="mt-3 text-sm font-semibold">{category.label}</h3>
                </article>
              );
            })}
          </div>
        </ExecutiveCard>

        <ExecutiveCard
          title="University Rankings"
          description="Accreditation standing and ranking movement for executive review"
        >
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {rankings.map((rank) => (
              <article
                key={rank.body}
                className="flex h-full flex-col rounded-xl border border-sgvu-navy/10 bg-white p-4 shadow-[0_4px_18px_rgba(8,35,74,0.04)]"
              >
                {/* Fixed label height keeps the value row aligned even when a body name wraps to two lines */}
                <p className="min-h-8 text-xs font-bold uppercase leading-4 tracking-[0.16em] text-muted-foreground">
                  {rank.body}
                </p>
                <p
                  className="mt-2 truncate font-mono text-xl font-black text-sgvu-navy"
                  title={rank.current}
                >
                  {rank.current}
                </p>
                <p className="mt-1 truncate text-xs text-muted-foreground" title={`Previous: ${rank.previous}`}>
                  Previous: {rank.previous}
                </p>
                <div className="mt-auto flex items-center gap-2 pt-3">
                  <Badge variant="success" className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap">
                    <TrendingUp className="h-3 w-3" aria-hidden="true" />
                    {rank.delta}
                  </Badge>
                  <span className="truncate text-xs font-medium text-sgvu-navy">{rank.status}</span>
                </div>
              </article>
            ))}
          </div>
        </ExecutiveCard>

        <ExecutiveCard
          title="Top Performing Departments"
          description="Recognition score based on achievements, research output, and awards"
        >
          <div className="overflow-x-auto">
            {/* aria-label instead of sr-only <caption>: absolutely-positioned captions escape
                the table in Chromium and stretch the document, creating blank scroll space. */}
            <table
              className="w-full min-w-[860px] text-left text-sm"
              aria-label="Departmental achievement ranking"
            >
              <thead className="border-b border-sgvu-navy/10 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left font-bold">Department</th>
                  <th scope="col" className="w-32 px-4 py-3 text-right font-bold">Achievements</th>
                  <th scope="col" className="w-28 px-4 py-3 text-right font-bold">Research</th>
                  <th scope="col" className="w-24 px-4 py-3 text-right font-bold">Awards</th>
                  <th scope="col" className="w-44 px-4 py-3 text-center font-bold">Recognition Score</th>
                  <th scope="col" className="w-28 px-4 py-3 text-center font-bold">Status</th>
                </tr>
              </thead>
              <tbody>
                {DEPARTMENTS.map((row) => (
                  <tr key={row.department} className="border-b border-sgvu-navy/5 last:border-0 hover:bg-slate-50/80">
                    <td className="px-4 py-3.5 text-left font-semibold text-sgvu-navy">{row.department}</td>
                    <td className="px-4 py-3.5 text-right font-mono tabular-nums">{row.achievements}</td>
                    <td className="px-4 py-3.5 text-right font-mono tabular-nums">{row.research}</td>
                    <td className="px-4 py-3.5 text-right font-mono tabular-nums">{row.awards}</td>
                    <td className="px-4 py-3.5 text-center font-mono tabular-nums text-sgvu-navy">{row.score}</td>
                    <td className="px-4 py-3.5 text-center">
                      <Badge className={cn('border-transparent', STATUS_STYLES[row.status])}>{row.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ExecutiveCard>

        <ExecutiveCard
          title="Research & Innovation"
          description="Publications, IP, grants, ventures, and global collaboration momentum"
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {RESEARCH_METRICS.map((metric) => {
              const Icon = metric.icon;
              return (
                <article key={metric.label} className="rounded-xl border border-sgvu-navy/10 bg-slate-50/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{metric.label}</p>
                    <div className="rounded-lg bg-sgvu-navy/5 p-2 text-sgvu-navy">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </div>
                  </div>
                  <p className="mt-3 font-mono text-2xl font-black text-sgvu-navy">{metric.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{metric.sub}</p>
                </article>
              );
            })}
          </div>
        </ExecutiveCard>

        <ExecutiveCard
          title="Sports & Cultural Achievements"
          description="Competitive excellence across sports, culture, and technical festivals"
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {SPORTS_CULTURAL.map((item) => {
              const Icon = item.icon;
              return (
                <article
                  key={item.label}
                  className="flex items-center gap-4 rounded-xl border border-sgvu-navy/10 bg-white p-4"
                >
                  <div className="rounded-xl bg-sgvu-gold/15 p-3 text-sgvu-navy">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{item.label}</p>
                    <p className="mt-1 font-mono text-2xl font-black text-sgvu-navy">{item.value}</p>
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
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-sgvu-gold">Executive AI Brief</p>
              <h2 className="mt-2 text-xl font-black">President&apos;s Recognition Summary</h2>
              <p className="mt-4 max-w-5xl text-sm leading-7 text-blue-50">
                This month the university achieved 34 major recognitions. Computer Science continues to lead in
                innovation. Faculty research publications increased by 18%. Students secured three national
                championships.
                <span className="font-semibold text-white">
                  {' '}
                  Recommendation: Highlight these achievements in upcoming accreditation and promotional activities.
                </span>
              </p>
            </div>
          </div>
        </section>

        <ExecutiveCard
          title="Featured Success Stories"
          description="Showcase narratives for government, industry, media, and campus visitors"
        >
          <div className="grid gap-4 lg:grid-cols-3">
            {SUCCESS_STORIES.map((story) => (
              <article
                key={story.headline}
                className="overflow-hidden rounded-2xl border border-sgvu-navy/10 bg-white shadow-[0_8px_24px_rgba(8,35,74,0.05)]"
              >
                <div
                  className="flex h-40 items-center justify-center bg-gradient-to-br from-sgvu-navy via-[#123a6d] to-sgvu-navy text-sgvu-gold"
                  aria-hidden="true"
                >
                  <Building2 className="h-12 w-12 opacity-80" />
                </div>
                <div className="space-y-3 p-5">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline" className="border-sgvu-navy/15 text-sgvu-navy">
                      {story.department}
                    </Badge>
                    <span>{story.date}</span>
                  </div>
                  <h3 className="text-base font-bold leading-snug text-sgvu-navy">{story.headline}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{story.summary}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-sgvu-navy/20 text-sgvu-navy hover:border-sgvu-navy hover:bg-sgvu-navy hover:text-white"
                    onClick={() => setStoryDetail(story)}
                  >
                    View Details
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </ExecutiveCard>

        <ExecutiveCard title="Executive Quick Actions" description="Briefing packs for accreditation, media, and visitors">
          <div className="flex flex-wrap gap-3">
            <ExecutiveExportButton
              targetId="achievements-recognition-report"
              filename="achievements-recognition-report"
              label="Generate Achievement Report"
            />
            <ExecutiveExportButton
              targetId="achievements-recognition-report"
              filename="achievements-executive-summary"
              label="Download Executive Summary"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => void shareHighlights()}
            >
              <Share2 className="h-4 w-4" aria-hidden="true" />
              Share University Highlights
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                document
                  .getElementById('latest-achievements')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
            >
              <FileText className="h-4 w-4" aria-hidden="true" />
              View Annual Achievements
            </Button>
            <ExecutiveExportButton
              targetId="achievements-recognition-report"
              filename="achievements-presentation"
              label="Export Presentation"
            />
          </div>
          <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Exports capture the current executive showcase for accreditation teams, industry partners, and media.
          </p>
        </ExecutiveCard>
      </main>

      <Dialog
        open={storyDetail !== null}
        onOpenChange={(open) => {
          if (!open) setStoryDetail(null);
        }}
      >
        <DialogContent className="max-w-lg">
          {storyDetail ? (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className="border-sgvu-navy/15 text-sgvu-navy">
                    {storyDetail.department}
                  </Badge>
                  <span>{storyDetail.date}</span>
                </div>
                <DialogTitle className="mt-2 text-xl font-black text-sgvu-navy">
                  {storyDetail.headline}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Executive brief for {storyDetail.headline}
                </DialogDescription>
              </DialogHeader>
              <p className="text-sm leading-relaxed text-muted-foreground">{storyDetail.summary}</p>
              <div className="rounded-xl border border-sgvu-gold/40 bg-sgvu-gold/10 px-4 py-3 text-sm text-sgvu-navy">
                Recommended for accreditation submissions, media briefings, and campus visitor showcases.
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  className="bg-[#0B2447] text-white transition-colors hover:bg-[#123A6D] active:bg-sgvu-gold active:text-sgvu-navy"
                  onClick={() => setStoryDetail(null)}
                >
                  Close
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
