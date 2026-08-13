'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Award,
  Banknote,
  Beaker,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  FileText,
  FlaskConical,
  Lightbulb,
  Microscope,
  Rocket,
  Sparkles,
  Target,
  Users,
  Wallet,
} from 'lucide-react';
import {
  FacultyPageHeader,
  FacultyPageShell,
  FacultyPanel,
} from '@/components/faculty';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuthedApi } from '@/lib/api';
import { createMoonshotsApi } from '@/lib/api/api.moonshots';
import {
  isEmptyArray,
  isFacultyDemoSmokeId,
  withFacultyDemoFallback,
} from '@/lib/faculty-demo-mode';
import { toast } from '@/lib/notifications/falcon-toast';
import { cn } from '@/lib/utils';

type ProjectStatus = 'Idea' | 'Planning' | 'Prototype' | 'Testing' | 'Published' | 'Completed';

type MoonshotProject = {
  id: string;
  name: string;
  domain: string;
  lead: string;
  teamSize: number;
  funding: number;
  progress: number;
  status: ProjectStatus;
  summary: string;
  stageIndex: number;
};

const TIMELINE_STAGES = [
  'Idea',
  'Proposal',
  'Approval',
  'Prototype',
  'Testing',
  'Publication',
  'Patent',
  'Commercialization',
] as const;

const STATUS_STYLES: Record<ProjectStatus, string> = {
  Idea: 'border-slate-200 bg-slate-50 text-slate-700',
  Planning: 'border-sky-200 bg-sky-50 text-sky-800',
  Prototype: 'border-violet-200 bg-violet-50 text-violet-800',
  Testing: 'border-amber-200 bg-amber-50 text-amber-800',
  Published: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  Completed: 'border-sgvu-navy/20 bg-sgvu-navy/5 text-sgvu-navy',
};

type ApiProgram = {
  program_id: string;
  code?: string;
  name: string;
  description?: string | null;
};

type ApiProject = {
  project_id: string;
  title: string;
  status?: string | null;
  program_code?: string | null;
  program_name?: string | null;
  student_name?: string | null;
  disclosure_notes?: string | null;
};

/** Maps DB statuses (IDEATION|ACTIVE|DISCLOSURE|IP_LINKED|ARCHIVED) to UI. */
function mapApiStatus(status?: string | null): { status: ProjectStatus; stageIndex: number; progress: number } {
  const s = (status ?? 'IDEATION').toUpperCase();
  if (s === 'ARCHIVED' || s.includes('COMPLETE'))
    return { status: 'Completed', stageIndex: 7, progress: 100 };
  if (s === 'IP_LINKED' || s.includes('PUBLISH') || s.includes('PATENT'))
    return { status: 'Published', stageIndex: 5, progress: 88 };
  if (s === 'DISCLOSURE' || s.includes('TEST'))
    return { status: 'Testing', stageIndex: 4, progress: 72 };
  if (s === 'ACTIVE' || s.includes('PROTO'))
    return { status: 'Prototype', stageIndex: 3, progress: 55 };
  if (s.includes('PLAN') || s.includes('APPROV') || s.includes('PROPOS'))
    return { status: 'Planning', stageIndex: 2, progress: 35 };
  return { status: 'Idea', stageIndex: 0, progress: 15 };
}

const STATUS_ADVANCE: Record<ProjectStatus, string | null> = {
  Idea: 'ACTIVE',
  Planning: 'ACTIVE',
  Prototype: 'DISCLOSURE',
  Testing: 'IP_LINKED',
  Published: 'ARCHIVED',
  Completed: null,
};

function mapApiProject(row: ApiProject): MoonshotProject {
  const mapped = mapApiStatus(row.status);
  return {
    id: row.project_id,
    name: row.title,
    domain: row.program_name || row.program_code || 'Deep Tech',
    lead: row.student_name || 'Student lead',
    teamSize: 1,
    funding: 0,
    progress: mapped.progress,
    status: mapped.status,
    summary: row.disclosure_notes?.trim() || 'Moonshot project tracked in Falcon research pipeline.',
    stageIndex: mapped.stageIndex,
  };
}

const DEMO_PROJECTS: MoonshotProject[] = [
  {
    id: 'ms-1',
    name: 'Quantum Sensing for Campus Security',
    domain: 'Quantum / Sensing',
    lead: 'Dr. Ananya Rao',
    teamSize: 6,
    funding: 1850000,
    progress: 62,
    status: 'Prototype',
    summary:
      'Low-noise quantum magnetometry for perimeter anomaly detection, co-developed with ECE and Physics.',
    stageIndex: 3,
  },
  {
    id: 'ms-2',
    name: 'Programmable Microfluidics Lab-on-Chip',
    domain: 'Bioengineering',
    lead: 'Dr. Kabir Mehta',
    teamSize: 8,
    funding: 2400000,
    progress: 38,
    status: 'Planning',
    summary:
      'Reconfigurable microfluidic cartridges for rapid pathogen screening in student health centres.',
    stageIndex: 2,
  },
  {
    id: 'ms-3',
    name: 'Edge AI for Predictive Maintenance',
    domain: 'AI Systems',
    lead: 'Prof. Neha Kapoor',
    teamSize: 5,
    funding: 980000,
    progress: 78,
    status: 'Testing',
    summary:
      'On-device models for HVAC and lab equipment failure prediction with energy-aware inference.',
    stageIndex: 4,
  },
  {
    id: 'ms-4',
    name: 'Solid-State Battery Materials Pipeline',
    domain: 'Materials Science',
    lead: 'Dr. Rohan Iyer',
    teamSize: 7,
    funding: 3200000,
    progress: 24,
    status: 'Idea',
    summary:
      'High-throughput screening of solid electrolytes for safer campus EV shuttle battery packs.',
    stageIndex: 1,
  },
  {
    id: 'ms-5',
    name: 'Neuromorphic Vision for Assistive Tech',
    domain: 'Neuromorphic Computing',
    lead: 'Dr. Meera Nair',
    teamSize: 4,
    funding: 1450000,
    progress: 91,
    status: 'Published',
    summary:
      'Event-based vision stack for low-power mobility aids; paper accepted at a tier-1 venue.',
    stageIndex: 5,
  },
  {
    id: 'ms-6',
    name: 'Climate Twin for Water Resilience',
    domain: 'Climate Tech',
    lead: 'Dr. Arjun Desai',
    teamSize: 9,
    funding: 2750000,
    progress: 100,
    status: 'Completed',
    summary:
      'Digital twin of campus watershed hydrology delivered to facilities and local municipal partners.',
    stageIndex: 7,
  },
];

const DEADLINES = [
  { title: 'Proposal Submission — SERB Seed', date: '2026-08-28', priority: 'High', days: 15 },
  { title: 'Grant Deadline — DST Deep Tech', date: '2026-09-12', priority: 'High', days: 30 },
  { title: 'Conference Submission — IEEE Sensors', date: '2026-09-05', priority: 'Medium', days: 23 },
  { title: 'Patent Review — Microfluidics IP', date: '2026-08-22', priority: 'High', days: 9 },
  { title: 'Project Review — Edge AI Pilot', date: '2026-08-18', priority: 'Medium', days: 5 },
];

const ACHIEVEMENTS = [
  {
    type: 'Patent Filed',
    date: '12 Jul 2026',
    detail: 'Provisional filing for adaptive microfluidic valve array (MS-02).',
  },
  {
    type: 'Research Published',
    date: '03 Jul 2026',
    detail: 'Neuromorphic vision paper accepted — open access preprint released.',
  },
  {
    type: 'Grant Approved',
    date: '28 Jun 2026',
    detail: '₹18.5L seed grant cleared for Quantum Sensing moonshot.',
  },
  {
    type: 'Prototype Completed',
    date: '20 Jun 2026',
    detail: 'Edge AI predictive maintenance board validated in Block-C labs.',
  },
  {
    type: 'Award Received',
    date: '10 Jun 2026',
    detail: 'University Innovation Medal for Climate Twin water resilience work.',
  },
];

const AI_ACTIONS = [
  { label: 'Generate Research Idea', q: 'Suggest a deep-tech research idea for my department' },
  { label: 'Generate Proposal', q: 'Draft a research proposal outline for a moonshot project' },
  { label: 'Write Abstract', q: 'Write a conference abstract for my current research' },
  { label: 'Literature Review', q: 'Help me structure a literature review for deep-tech work' },
  { label: 'Patent Idea', q: 'Suggest patentable aspects of my prototype work' },
  { label: 'Grant Proposal', q: 'Outline a grant proposal for DST deep-tech funding' },
];

const QUICK_ACTIONS = [
  { label: 'Create Proposal', href: '/faculty/research', icon: FileText },
  { label: 'Upload Publication', href: '/faculty/research', icon: BookOpen },
  { label: 'Add Patent', href: '/faculty/research', icon: Award },
  {
    label: 'Generate AI Proposal',
    href: '/faculty/ai-assistant?q=' + encodeURIComponent('Draft a moonshot research proposal'),
    icon: Sparkles,
  },
  { label: 'View Reports', href: '/faculty/reports', icon: Target },
  { label: 'Request Funding', href: '/faculty/research-approvals', icon: Wallet },
];

function inr(amount: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

function priorityTone(priority: string) {
  if (priority === 'High') return 'bg-red-50 text-red-700 border-red-200';
  if (priority === 'Medium') return 'bg-amber-50 text-amber-800 border-amber-200';
  return 'bg-slate-50 text-slate-700 border-slate-200';
}

export default function FacultyDeepTechMoonshotsPage() {
  const api = useAuthedApi();
  const moonshotsApi = useMemo(() => createMoonshotsApi(api), [api]);
  const [projects, setProjects] = useState<MoonshotProject[]>(DEMO_PROJECTS);
  const [programs, setPrograms] = useState<ApiProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<MoonshotProject | null>(null);
  const [focusStage, setFocusStage] = useState(3);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newProgramId, setNewProgramId] = useState('');
  const [newNotes, setNewNotes] = useState('');

  async function reload() {
    setLoading(true);
    try {
      const [progRows, projectRows] = await Promise.all([
        moonshotsApi.programs().catch(() => [] as ApiProgram[]),
        moonshotsApi.projects().catch(() => [] as ApiProject[]),
      ]);
      setPrograms(Array.isArray(progRows) ? progRows : []);
      const mapped = (Array.isArray(projectRows) ? projectRows : []).map(mapApiProject);
      setProjects(withFacultyDemoFallback(mapped, DEMO_PROJECTS, isEmptyArray));
    } catch {
      setProjects(withFacultyDemoFallback([], DEMO_PROJECTS, isEmptyArray));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [moonshotsApi]);

  async function createProject() {
    if (!newTitle.trim()) {
      toast.error('Enter a project title');
      return;
    }
    if (!newProgramId) {
      toast.error('Select a moonshot program');
      return;
    }
    if (isFacultyDemoSmokeId(newProgramId)) {
      toast.success('Moonshot project created (demo)');
      setCreateOpen(false);
      setNewTitle('');
      setNewNotes('');
      return;
    }
    setCreating(true);
    try {
      await moonshotsApi.create({
        program_id: newProgramId,
        title: newTitle.trim(),
        disclosure_notes: newNotes.trim() || undefined,
      });
      toast.success('Moonshot project created');
      setCreateOpen(false);
      setNewTitle('');
      setNewNotes('');
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create project');
    } finally {
      setCreating(false);
    }
  }

  async function advanceStatus(project: MoonshotProject) {
    const next = STATUS_ADVANCE[project.status];
    if (!next) {
      toast.success('Project already archived / completed');
      return;
    }
    if (isFacultyDemoSmokeId(project.id)) {
      const mapped = mapApiStatus(next);
      setProjects((prev) =>
        prev.map((p) =>
          p.id === project.id
            ? { ...p, status: mapped.status, stageIndex: mapped.stageIndex, progress: mapped.progress }
            : p,
        ),
      );
      setSelected((prev) =>
        prev && prev.id === project.id
          ? { ...prev, status: mapped.status, stageIndex: mapped.stageIndex, progress: mapped.progress }
          : prev,
      );
      setFocusStage(mapped.stageIndex);
      toast.success(`Status updated to ${mapped.status} (demo)`);
      return;
    }
    setStatusBusy(true);
    try {
      await moonshotsApi.updateStatus(project.id, { status: next });
      toast.success(`Status updated to ${next}`);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update status');
    } finally {
      setStatusBusy(false);
    }
  }

  const kpis = useMemo(() => {
    const active = projects.filter((p) => p.status !== 'Completed').length;
    const fundingTotal = projects.reduce((s, p) => s + p.funding, 0);
    const students = projects.reduce((s, p) => s + p.teamSize, 0);
    const published = projects.filter((p) => p.status === 'Published' || p.status === 'Completed').length;
    return [
      {
        label: 'Active Projects',
        value: active,
        desc: loading ? 'Loading…' : 'In flight moonshots',
        icon: Rocket,
        onClick: () => document.getElementById('moonshot-projects')?.scrollIntoView({ behavior: 'smooth' }),
      },
      {
        label: 'Programs',
        value: programs.length || DEMO_PROJECTS.length,
        desc: 'Deep-tech tracks',
        icon: FileText,
        onClick: () => document.getElementById('moonshot-deadlines')?.scrollIntoView({ behavior: 'smooth' }),
      },
      {
        label: 'Advanced / Published',
        value: published,
        desc: 'Near commercialization',
        icon: Award,
        onClick: () => document.getElementById('moonshot-achievements')?.scrollIntoView({ behavior: 'smooth' }),
      },
      {
        label: 'Portfolio size',
        value: projects.length,
        desc: 'Tracked moonshots',
        icon: BookOpen,
        onClick: () => document.getElementById('moonshot-achievements')?.scrollIntoView({ behavior: 'smooth' }),
      },
      {
        label: 'Funding Received',
        value: inr(fundingTotal || 12630000),
        desc: fundingTotal ? 'From linked records' : 'Showcase baseline',
        icon: Banknote,
        onClick: () => document.getElementById('moonshot-funding')?.scrollIntoView({ behavior: 'smooth' }),
      },
      {
        label: 'Student Researchers',
        value: students,
        desc: 'Across moonshot teams',
        icon: Users,
        onClick: () => document.getElementById('moonshot-teams')?.scrollIntoView({ behavior: 'smooth' }),
      },
    ];
  }, [projects, programs.length, loading]);

  const teamRows = useMemo(
    () =>
      projects.slice(0, 8).map((p) => ({
        project: p.name,
        mentor: p.lead,
        students: p.teamSize,
        department: p.domain,
        progress: p.progress,
      })),
    [projects],
  );

  const funding = useMemo(() => {
    const approved = Math.max(
      12630000,
      projects.reduce((s, p) => s + p.funding, 0),
    );
    const pending = 4200000;
    const utilized = Math.round(approved * 0.62);
    const remaining = approved - utilized;
    return {
      approved,
      pending,
      utilized,
      remaining,
      utilizedPct: Math.round((utilized / approved) * 100),
      remainingPct: Math.round((remaining / approved) * 100),
    };
  }, [projects]);

  return (
    <FacultyPageShell>
      <FacultyPageHeader
        title="Deep-Tech Moonshots"
        description="Transforming innovative research ideas into real-world impact."
        actions={
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Button
              className="bg-sgvu-navy text-white hover:bg-[#123A6D] active:bg-sgvu-gold active:text-sgvu-navy"
              onClick={() => {
                setNewProgramId(programs[0]?.program_id ?? '');
                setCreateOpen(true);
              }}
            >
              <Lightbulb className="mr-2 h-4 w-4" />
              New Moonshot
            </Button>
            <Button asChild variant="outline" className="border-sgvu-navy/20">
              <Link href="/faculty/ai-assistant?q=Help%20me%20with%20deep-tech%20research">
                <Sparkles className="mr-2 h-4 w-4 text-sgvu-gold" />
                AI Research Assistant
              </Link>
            </Button>
          </div>
        }
      />

      {/* KPI row */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <button
              key={kpi.label}
              type="button"
              onClick={kpi.onClick}
              className="group rounded-xl border border-border/70 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-sgvu-gold/40 hover:shadow-md"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-sgvu-navy/10 text-sgvu-navy transition group-hover:bg-sgvu-gold/20">
                  <Icon className="h-4 w-4" />
                </span>
                <CircleDot className="h-3.5 w-3.5 text-sgvu-gold opacity-0 transition group-hover:opacity-100" />
              </div>
              <p className="text-2xl font-black tabular-nums tracking-tight text-sgvu-navy">
                {kpi.value}
              </p>
              <p className="mt-1 text-sm font-semibold text-sgvu-navy">{kpi.label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{kpi.desc}</p>
            </button>
          );
        })}
      </div>

      {/* Active projects */}
      <div id="moonshot-projects">
        <FacultyPanel
          title="Active Moonshot Projects"
          description="Click a card to review domain, funding, and stage details"
          count={projects.length}
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => {
                  setSelected(project);
                  setFocusStage(project.stageIndex);
                }}
                className="flex h-full flex-col rounded-xl border border-border/70 bg-gradient-to-b from-white to-slate-50/60 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-sgvu-gold/45 hover:shadow-md"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <p className="text-sm font-bold leading-snug text-sgvu-navy">{project.name}</p>
                  <span
                    className={cn(
                      'shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                      STATUS_STYLES[project.status],
                    )}
                  >
                    {project.status}
                  </span>
                </div>
                <p className="text-xs font-medium text-sgvu-gold">{project.domain}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Lead · <span className="font-semibold text-sgvu-navy">{project.lead}</span>
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-white/80 px-2.5 py-2 ring-1 ring-border/60">
                    <p className="text-muted-foreground">Team</p>
                    <p className="font-bold tabular-nums text-sgvu-navy">{project.teamSize}</p>
                  </div>
                  <div className="rounded-lg bg-white/80 px-2.5 py-2 ring-1 ring-border/60">
                    <p className="text-muted-foreground">Funding</p>
                    <p className="font-bold tabular-nums text-sgvu-navy">{inr(project.funding)}</p>
                  </div>
                </div>
                <div className="mt-auto pt-3">
                  <div className="mb-1 flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-bold tabular-nums text-sgvu-navy">{project.progress}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-sgvu-navy to-sgvu-gold transition-all"
                      style={{ width: `${project.progress}%` }}
                    />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </FacultyPanel>
      </div>

      {/* Timeline */}
      <FacultyPanel
        title="Research Timeline"
        description="End-to-end path from idea to commercialization — stage highlights update with the selected project"
      >
        <div className="overflow-x-auto pb-1">
          <ol className="flex min-w-[640px] items-start gap-0 md:min-w-0 md:grid md:grid-cols-8">
            {TIMELINE_STAGES.map((stage, index) => {
              const active = index === focusStage;
              const done = index < focusStage;
              return (
                <li key={stage} className="relative flex flex-1 flex-col items-center px-1">
                  {index < TIMELINE_STAGES.length - 1 ? (
                    <span
                      className={cn(
                        'absolute left-1/2 top-3.5 hidden h-0.5 w-full md:block',
                        done || active ? 'bg-sgvu-gold' : 'bg-border',
                      )}
                    />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setFocusStage(index)}
                    className={cn(
                      'relative z-[1] flex h-7 w-7 items-center justify-center rounded-full border text-[10px] font-bold transition',
                      active && 'border-sgvu-gold bg-sgvu-gold text-sgvu-navy ring-4 ring-sgvu-gold/25',
                      done && !active && 'border-sgvu-navy bg-sgvu-navy text-white',
                      !done && !active && 'border-border bg-white text-muted-foreground',
                    )}
                  >
                    {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}
                  </button>
                  <p
                    className={cn(
                      'mt-2 text-center text-[11px] font-semibold leading-tight',
                      active ? 'text-sgvu-navy' : 'text-muted-foreground',
                    )}
                  >
                    {stage}
                  </p>
                </li>
              );
            })}
          </ol>
        </div>
        <p className="mt-4 rounded-lg border border-sgvu-navy/10 bg-sgvu-navy/[0.03] px-3 py-2 text-xs text-sgvu-navy">
          Current focus: <span className="font-bold">{TIMELINE_STAGES[focusStage]}</span>
          {selected ? ` · aligned to ${selected.name}` : ' · select a project card to sync stage'}
        </p>
      </FacultyPanel>

      {/* AI + Deadlines */}
      <div className="grid items-stretch gap-4 xl:grid-cols-2">
        <FacultyPanel
          title="AI Research Assistant"
          description="Quick prompts that open Falcon AI with a ready research ask"
        >
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-sgvu-gold/30 bg-gradient-to-r from-sgvu-gold/10 to-white px-3 py-2.5">
            <Sparkles className="h-4 w-4 text-sgvu-gold" />
            <p className="text-xs text-sgvu-navy">
              Use AI to accelerate ideation — then refine with your lab notes before submission.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {AI_ACTIONS.map((action) => (
              <Button
                key={action.label}
                asChild
                variant="outline"
                className="h-11 justify-start border-border/70 text-left"
              >
                <Link href={`/faculty/ai-assistant?q=${encodeURIComponent(action.q)}`}>
                  <Beaker className="mr-2 h-4 w-4 shrink-0 text-sgvu-navy" />
                  <span className="truncate">{action.label}</span>
                </Link>
              </Button>
            ))}
          </div>
        </FacultyPanel>

        <div id="moonshot-deadlines">
          <FacultyPanel
            title="Upcoming Deadlines"
            description="Proposal, grant, conference, and review milestones"
            count={DEADLINES.length}
            className="h-full"
          >
            <ul className="space-y-2">
              {DEADLINES.map((item) => (
                <li
                  key={item.title}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-white px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-sgvu-navy">{item.title}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarClock className="h-3.5 w-3.5" />
                      {new Date(item.date).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cn('text-[10px]', priorityTone(item.priority))}>
                      {item.priority}
                    </Badge>
                    <span className="rounded-md bg-sgvu-navy/5 px-2 py-1 text-xs font-bold tabular-nums text-sgvu-navy">
                      {item.days}d
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </FacultyPanel>
        </div>
      </div>

      {/* Achievements + Funding */}
      <div className="grid items-stretch gap-4 xl:grid-cols-2">
        <div id="moonshot-achievements">
          <FacultyPanel
            title="Recent Achievements"
            description="Patents, publications, grants, and awards"
            className="h-full"
          >
            <ul className="space-y-2">
              {ACHIEVEMENTS.map((item) => (
                <li
                  key={item.type + item.date}
                  className="rounded-xl border border-border/60 bg-white px-3 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-bold text-sgvu-navy">{item.type}</p>
                    <span className="text-xs text-muted-foreground">{item.date}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
                </li>
              ))}
            </ul>
          </FacultyPanel>
        </div>

        <div id="moonshot-funding">
          <FacultyPanel
            title="Funding Summary"
            description="Approved, pending, utilized, and remaining budget"
            className="h-full"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { label: 'Approved Funding', value: funding.approved, tone: 'navy' as const },
                { label: 'Pending Funding', value: funding.pending, tone: 'amber' as const },
                { label: 'Utilized Budget', value: funding.utilized, tone: 'emerald' as const },
                { label: 'Remaining Budget', value: funding.remaining, tone: 'gold' as const },
              ].map((row) => (
                <div
                  key={row.label}
                  className="rounded-xl border border-border/60 bg-slate-50/60 px-3 py-3"
                >
                  <p className="text-xs text-muted-foreground">{row.label}</p>
                  <p className="mt-1 text-lg font-black tabular-nums text-sgvu-navy">
                    {inr(row.value)}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-muted-foreground">Utilized</span>
                  <span className="font-bold text-sgvu-navy">{funding.utilizedPct}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-sgvu-navy"
                    style={{ width: `${funding.utilizedPct}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-muted-foreground">Remaining</span>
                  <span className="font-bold text-sgvu-navy">{funding.remainingPct}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-sgvu-gold"
                    style={{ width: `${funding.remainingPct}%` }}
                  />
                </div>
              </div>
            </div>
          </FacultyPanel>
        </div>
      </div>

      {/* Student teams */}
      <div id="moonshot-teams">
        <FacultyPanel
          title="Student Research Teams"
          description="Mentored cohorts attached to active moonshots"
          count={teamRows.length}
        >
          <div className="overflow-hidden rounded-xl border border-border/60">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2.5 font-medium">Project</th>
                  <th className="px-3 py-2.5 font-medium">Lead</th>
                  <th className="px-3 py-2.5 font-medium">Program</th>
                  <th className="px-3 py-2.5 text-right font-medium">Students</th>
                  <th className="px-3 py-2.5 font-medium">Progress</th>
                </tr>
              </thead>
              <tbody>
                {teamRows.map((team) => (
                  <tr key={team.project} className="border-b last:border-0">
                    <td className="px-3 py-2.5 font-medium text-sgvu-navy">{team.project}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{team.mentor}</td>
                    <td className="px-3 py-2.5">{team.department}</td>
                    <td className="px-3 py-2.5 text-right font-bold tabular-nums text-sgvu-navy">
                      {team.students}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex min-w-[7rem] items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-sgvu-navy to-sgvu-gold"
                            style={{ width: `${team.progress}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold tabular-nums text-sgvu-navy">
                          {team.progress}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </FacultyPanel>
      </div>

      {/* Quick actions */}
      <FacultyPanel title="Quick Actions" description="Jump to research workflows without leaving the innovation desk">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.label}
                href={action.href}
                className="group flex h-20 items-center gap-3 rounded-xl border border-border/70 bg-white px-4 shadow-sm transition hover:-translate-y-0.5 hover:border-sgvu-gold/40 hover:shadow-md"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-sgvu-navy text-white transition group-active:bg-sgvu-gold group-active:text-sgvu-navy">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-sm font-bold text-sgvu-navy">{action.label}</span>
              </Link>
            );
          })}
        </div>
      </FacultyPanel>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sgvu-navy">{selected?.name}</DialogTitle>
            <DialogDescription>{selected?.domain}</DialogDescription>
          </DialogHeader>
          {selected ? (
            <div className="space-y-4 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge className={cn('border', STATUS_STYLES[selected.status])}>{selected.status}</Badge>
                <Badge variant="outline">{selected.teamSize} researchers</Badge>
                <Badge variant="secondary">{inr(selected.funding)}</Badge>
              </div>
              <p className="text-muted-foreground">{selected.summary}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Faculty Lead</p>
                  <p className="font-semibold text-sgvu-navy">{selected.lead}</p>
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Timeline stage</p>
                  <p className="font-semibold text-sgvu-navy">
                    {TIMELINE_STAGES[selected.stageIndex]}
                  </p>
                </div>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="font-bold text-sgvu-navy">{selected.progress}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-sgvu-navy to-sgvu-gold"
                    style={{ width: `${selected.progress}%` }}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  size="sm"
                  className="bg-sgvu-navy text-white"
                  disabled={statusBusy || selected.status === 'Completed'}
                  onClick={() => void advanceStatus(selected)}
                >
                  Advance Status
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href="/faculty/ai-assistant?q=Help%20me%20advance%20this%20moonshot%20project">
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                    Ask AI
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href="/faculty/research">
                    <FlaskConical className="mr-1.5 h-3.5 w-3.5" />
                    Open Research Log
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href="/faculty/research-approvals">
                    <Microscope className="mr-1.5 h-3.5 w-3.5" />
                    Funding Desk
                  </Link>
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sgvu-navy">Create moonshot project</DialogTitle>
            <DialogDescription>
              Registers a project under a deep-tech program (status starts at Ideation).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-sgvu-navy">Program</span>
              <Select
                className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
                value={newProgramId}
                onChange={(e) => setNewProgramId(e.target.value)}
              >
                <option value="">Select program</option>
                {programs.map((p) => (
                  <option key={p.program_id} value={p.program_id}>
                    {p.code ? `${p.code} — ` : ''}
                    {p.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-sgvu-navy">Title</span>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Project title"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-sgvu-navy">Disclosure notes</span>
              <Input
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="Optional IP / novelty notes"
              />
            </label>
            {!programs.length ? (
              <p className="text-xs text-amber-700">
                No programs returned from API — create will only work once programs are seeded.
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-sgvu-navy text-white"
              disabled={creating || !programs.length}
              onClick={() => void createProject()}
            >
              {creating ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </FacultyPageShell>
  );
}
