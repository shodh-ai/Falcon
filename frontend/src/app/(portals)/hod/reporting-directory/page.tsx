'use client';

import React, { Suspense, useState, useMemo, useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import {
  Users,
  Search,
  MapPin,
  Phone,
  Mail,
  X,
  Calendar,
  Clock,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Briefcase,
} from 'lucide-react';
import { useAuthedApi } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ZimyoTeamDashboard } from '@/components/zimyo/ZimyoTeamDashboard';
import { ZimyoReportsGrid } from '@/components/zimyo/ZimyoReportsGrid';
import { ZimyoEmployeeOverview } from '@/components/zimyo/ZimyoEmployeeOverview';
import { ZimyoPoliciesPanel } from '@/components/zimyo/ZimyoPoliciesPanel';
import { ZimyoComingSoon } from '@/components/zimyo/ZimyoComingSoon';
import { TeamRequestsPanel } from '@/components/self-service/TeamRequestsPanel';
import { TeamAttendancePanel } from '@/components/self-service/TeamAttendancePanel';
import { useTeamScope, useTeamScopeCounts, scopeTabLabel, type TeamScope } from '@/components/self-service/TeamScopeBar';

const HOD_DEFAULT_SCOPE: TeamScope = 'dept';

interface FacultyRosterItem {
  user_id: string;
  name: string;
  email: string;
  phone: string | null;
  entity_id: number | null;
  employee_id: string | null;
  department: string | null;
  role: string | null;
  designation: string | null;
  reporting_officer_id: string | null;
  reports_to_name: string | null;
  hod_name: string | null;
  joined_at: string | null;
  shift_timing: string | null;
  courses?: { course_name: string; course_code: string }[];
}

interface ZimyoMember {
  id: string;
  name: string;
  empId: string;
  designation: string;
  department: string;
  phone: string;
  location: string;
  email: string;
  reportsTo: string;
  joiningDate: string;
  probationEnd: string;
  shiftTiming: string;
  status: 'PRESENT' | 'ABSENT' | 'LEAVE' | 'HALF_DAY' | 'WFH';
  tag: string;
}

type AttendanceMatrixDay = {
  date: string;
  top_line: string;
  bottom_line: string;
  color: 'red' | 'yellow' | 'green' | 'gray';
};

function todayStatusFromMatrix(days: AttendanceMatrixDay[]): ZimyoMember['status'] {
  const today = new Date().getDate();
  const cell = days.find((d) => Number(d.date.slice(8, 10)) === today);
  if (!cell) return 'PRESENT';
  if (cell.bottom_line.startsWith('Leave')) return 'LEAVE';
  if (cell.bottom_line === 'Absent' || cell.color === 'red') return 'ABSENT';
  if (cell.bottom_line === 'On Duty') return 'HALF_DAY';
  if (cell.color === 'yellow') return 'LEAVE';
  return 'PRESENT';
}

type ProfileTab = 'details' | 'feedback' | 'performance' | 'assets';
type TabId = 'dashboard' | 'summary' | 'reports' | 'policy' | 'requests' | 'attendance' | 'tasks';

const VALID_TABS: TabId[] = ['dashboard', 'summary', 'reports', 'policy', 'requests', 'attendance', 'tasks'];

function parseTab(raw: string | null): TabId {
  if (raw && VALID_TABS.includes(raw as TabId)) return raw as TabId;
  return 'attendance';
}

function ReportingDirectoryContent() {
  const api = useAuthedApi();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const teamScope = useTeamScope(HOD_DEFAULT_SCOPE);
  const scopeCounts = useTeamScopeCounts();
  const activeTab = parseTab(searchParams.get('tab'));

  function setActiveTab(tab: TabId) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    if (!params.get('scope')) params.set('scope', HOD_DEFAULT_SCOPE);
    router.replace(`${pathname}?${params.toString()}`);
  }

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    let changed = false;
    if (!params.get('tab')) {
      params.set('tab', 'attendance');
      changed = true;
    }
    if (!params.get('scope')) {
      params.set('scope', HOD_DEFAULT_SCOPE);
      changed = true;
    }
    if (changed) {
      router.replace(`${pathname}?${params.toString()}`);
    }
  }, [pathname, router, searchParams]);

  function setSummaryScope(next: TeamScope) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('scope', next);
    params.set('tab', 'summary');
    router.replace(`${pathname}?${params.toString()}`);
  }

  const [searchQuery, setSearchQuery] = useState('');

  const [selectedMember, setSelectedMember] = useState<ZimyoMember | null>(null);
  const [profileTab, setProfileTab] = useState<ProfileTab>('details');

  const [members, setMembers] = useState<ZimyoMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadRoster() {
      try {
        const month = new Date().toISOString().slice(0, 7);
        const [roster, matrix] = await Promise.all([
          api.get<FacultyRosterItem[]>('/api/academics/hod/faculty-roster'),
          api.get<{
            employees: Array<{
              user_id: string;
              name: string;
              employee_id: string | null;
              days: AttendanceMatrixDay[];
            }>;
          }>(
            `/api/hr/ess/team/attendance?scope=${teamScope}&month=${month}`,
          ).catch(() => ({ employees: [] })),
        ]);

        const rosterById = new Map(roster.map((f) => [f.user_id, f]));
        const scopedEmployees = matrix.employees ?? [];

        const mapRosterMember = (f: FacultyRosterItem, idx: number, status: ZimyoMember['status'] = 'ABSENT'): ZimyoMember => {
          const joinedAt = f.joined_at ?? null;
          const joinedDate = joinedAt
            ? new Date(joinedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-')
            : '—';
          const probationDate = joinedAt
            ? new Date(new Date(joinedAt).setFullYear(new Date(joinedAt).getFullYear() + 1))
                .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-')
            : '—';
          const shiftRaw = f.shift_timing;
          const shiftTiming = shiftRaw
            ? shiftRaw.replace(/(\d{2}:\d{2})(?::\d{2})?/g, (_, t: string) => {
                const [h, m] = t.split(':').map(Number);
                const ampm = h >= 12 ? 'PM' : 'AM';
                const hr = h % 12 || 12;
                return `${String(hr).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
              })
            : '—';
          return {
            id: f.user_id,
            name: f.name,
            empId: f.employee_id ?? (f.entity_id ? String(f.entity_id) : `EMP${String(idx + 1).padStart(3, '0')}`),
            designation: f.designation ?? f.role ?? 'Faculty',
            department: f.department ?? 'Department',
            phone: f.phone ?? '—',
            location: f.department ?? 'Campus',
            email: f.email ?? '—',
            reportsTo: f.reports_to_name ?? roster[0]?.hod_name ?? 'HOD',
            joiningDate: joinedDate,
            probationEnd: probationDate,
            shiftTiming,
            status,
            tag: f.role ?? 'Faculty',
          };
        };

        if (scopedEmployees.length === 0) {
          if (roster.length === 0) {
            setMembers([]);
            setLoading(false);
            return;
          }
          setMembers(roster.map((f, idx) => mapRosterMember(f, idx)));
          setLoading(false);
          return;
        }

        const firstHodName = roster[0]?.hod_name ?? 'HOD';

        const mapped: ZimyoMember[] = scopedEmployees.map((emp, idx) => {
          const f = rosterById.get(emp.user_id);
          const joinedAt = f?.joined_at ?? null;
          const joinedDate = joinedAt
            ? new Date(joinedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-')
            : '—';
          const probationDate = joinedAt
            ? new Date(new Date(joinedAt).setFullYear(new Date(joinedAt).getFullYear() + 1))
                .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-')
            : '—';
          const shiftRaw = f?.shift_timing;
          const shiftTiming = shiftRaw
            ? shiftRaw.replace(/(\d{2}:\d{2})(?::\d{2})?/g, (_, t: string) => {
                const [h, m] = t.split(':').map(Number);
                const ampm = h >= 12 ? 'PM' : 'AM';
                const hr = h % 12 || 12;
                return `${String(hr).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
              })
            : '—';
          return {
            id: emp.user_id,
            name: f?.name ?? emp.name,
            empId: f?.employee_id ?? (f?.entity_id ? String(f.entity_id) : emp.employee_id ?? `EMP${String(idx + 1).padStart(3, '0')}`),
            designation: f?.designation ?? f?.role ?? 'Faculty',
            department: f?.department ?? 'Department',
            phone: f?.phone ?? '—',
            location: f?.department ?? 'Campus',
            email: f?.email ?? '—',
            reportsTo: f?.reports_to_name ?? firstHodName,
            joiningDate: joinedDate,
            probationEnd: probationDate,
            shiftTiming,
            status: todayStatusFromMatrix(emp.days),
            tag: f?.role ?? 'Faculty',
          };
        });
        setMembers(mapped);
      } catch (err) {
        console.error('Failed to load faculty roster', err);
      } finally {
        setLoading(false);
      }
    }
    loadRoster();
  }, [api, teamScope]);

  const statsSummary = useMemo(() => {
    let leave = 0, wfh = 0, onDuty = 0, absent = 0;
    members.forEach((m) => {
      if (m.status === 'LEAVE') leave++;
      else if (m.status === 'WFH') wfh++;
      else if (m.status === 'HALF_DAY') onDuty++;
      else if (m.status === 'ABSENT') absent++;
    });
    return { leave, wfh, onDuty, absent };
  }, [members]);

  const MEMBER_STATUS_BADGE: Record<ZimyoMember['status'], string> = {
    PRESENT: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
    ABSENT: 'bg-rose-50 text-rose-700 border border-rose-100',
    LEAVE: 'bg-amber-50 text-amber-700 border border-amber-100',
    WFH: 'bg-blue-50 text-blue-700 border border-blue-100',
    HALF_DAY: 'bg-violet-50 text-violet-700 border border-violet-100',
  };

  const filteredMembers = useMemo(() => {
    return members.filter((m) =>
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.empId.includes(searchQuery) ||
      m.designation.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [members, searchQuery]);

return (
    <div className="min-h-screen bg-slate-50/50 p-6 space-y-6">

      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-sgvu-navy flex items-center justify-center text-white shadow-md shadow-sgvu-navy/10">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-sgvu-navy">Team HRMS Directory</h1>
            <p className="text-xs text-slate-500 font-medium">Manage team attendance, approvals, and HR analytics for your department</p>
          </div>
        </div>
        <div className="flex bg-slate-100 p-1.5 rounded-xl border border-slate-200/50 flex-wrap gap-1">
          {([
            { key: 'dashboard', label: 'Team Dashboard' },
            { key: 'summary', label: 'Summary Directory' },
            { key: 'reports', label: 'Reports' },
            { key: 'policy', label: 'Policy' },
            { key: 'requests', label: 'Team Requests' },
            { key: 'attendance', label: 'Spreadsheet Tracker' },
            { key: 'tasks', label: 'Task Manager' },
          ] as { key: TabId; label: string }[]).map(({ key, label }) => (
            <button key={key} onClick={() => setActiveTab(key)} className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === key ? 'bg-white text-sgvu-navy shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{label}</button>
          ))}
        </div>
      </div>

      {/* ═══════════ TEAM DASHBOARD TAB ═══════════ */}
      {activeTab === 'dashboard' && (
        <ZimyoTeamDashboard defaultScope={HOD_DEFAULT_SCOPE} />
      )}

      {/* ═══════════ REPORTS TAB ═══════════ */}
      {activeTab === 'reports' && (
        <ZimyoReportsGrid defaultScope={HOD_DEFAULT_SCOPE} />
      )}

      {/* ═══════════ POLICY TAB ═══════════ */}
      {activeTab === 'policy' && (
        <ZimyoPoliciesPanel />
      )}

      {/* ═══════════ SUMMARY TAB ═══════════ */}
      {activeTab === 'summary' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="flex border-b border-slate-200 gap-6 text-sm font-semibold text-slate-400">
            {(['direct', 'indirect', 'dept'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setSummaryScope(f)}
                className={`pb-3 border-b-2 transition-all ${teamScope === f ? 'border-sgvu-navy text-sgvu-navy font-bold' : 'border-transparent hover:text-slate-700'}`}
              >
                {scopeTabLabel(f, scopeCounts)}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            {([
              { label: 'On Leave', value: statsSummary.leave, icon: <Calendar className="h-5 w-5" />, bg: 'bg-blue-50', text: 'text-blue-600' },
              { label: 'Work From Home', value: statsSummary.wfh, icon: <Clock className="h-5 w-5" />, bg: 'bg-emerald-50', text: 'text-emerald-600' },
              { label: 'On Duty', value: statsSummary.onDuty, icon: <CheckCircle2 className="h-5 w-5" />, bg: 'bg-amber-50', text: 'text-amber-600' },
              { label: 'Absent', value: statsSummary.absent, icon: <X className="h-5 w-5" />, bg: 'bg-rose-50', text: 'text-rose-600' },
            ]).map(({ label, value, icon, bg, text }) => (
              <div key={label} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-start gap-4">
                <div className={`h-10 w-10 rounded-xl ${bg} ${text} flex items-center justify-center`}>{icon}</div>
                <div className="space-y-1">
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">{label}</p>
                  <h3 className="text-2xl font-bold text-slate-800">{value}</h3>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              Members <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-bold">{filteredMembers.length}</span>
            </h2>
            <div className="relative w-80">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input placeholder="Search by name, ID or designation..." className="pl-9 h-9 text-xs rounded-xl border-slate-200 focus-visible:ring-sgvu-navy" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
          </div>

          {loading ? (
            <div className="py-8 text-center text-xs text-slate-400 font-bold">Loading team members...</div>
          ) : filteredMembers.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400 font-bold">No team members in this scope.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
              {filteredMembers.map((m) => {
                const sl = m.status === 'HALF_DAY' ? 'Half Day' : m.status === 'WFH' ? 'WFH' : m.status.charAt(0) + m.status.slice(1).toLowerCase();
                return (
                  <div key={m.id} onClick={() => { setSelectedMember(m); setProfileTab('details'); }} className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm hover:shadow-md hover:border-slate-200 transition-all cursor-pointer space-y-4">
                    <div className="flex justify-between items-start">
                      <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-100 font-bold text-[9px] py-0 px-2 hover:bg-emerald-50 rounded-md">{m.tag}</Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-sgvu-navy/5 text-sgvu-navy font-bold flex items-center justify-center text-xs border border-sgvu-navy/10">
                        {m.name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm leading-tight">{m.name} ({m.empId})</h4>
                        <p className="text-[11px] text-slate-500 font-semibold">{m.designation}</p>
                        <p className="text-[10px] text-slate-400 font-medium">{m.department}</p>
                      </div>
                    </div>
                    <div className="space-y-1.5 border-t border-slate-50 pt-3 text-xs text-slate-600 font-semibold">
                      <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-slate-400" /><span>{m.phone}</span></div>
                      <div className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-slate-400" /><span>{m.location}</span></div>
                      <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-slate-400" /><span className="truncate max-w-[200px]">{m.email}</span></div>
                    </div>
                    <div className="border-t border-slate-50 pt-2.5 flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-bold">Reports to: <span className="text-slate-700">{m.reportsTo}</span></span>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${MEMBER_STATUS_BADGE[m.status]}`}>{sl}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════ REQUESTS TAB ═══════════ */}
      {activeTab === 'requests' && (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-6 animate-in fade-in duration-200 space-y-4">
          <p className="text-xs text-slate-500 font-medium rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3">
            Leave, gate pass, regularisation, and other team approvals live here under{' '}
            <span className="font-bold text-sgvu-navy">Team Requests</span>
            . Use the tabs above to switch between request types.
          </p>
          <TeamRequestsPanel defaultScope={HOD_DEFAULT_SCOPE} />
        </div>
      )}

      {/* ═══════════ SPREADSHEET TAB ═══════════ */}
      {activeTab === 'attendance' && (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-6 animate-in fade-in duration-200">
          <TeamAttendancePanel defaultScope={HOD_DEFAULT_SCOPE} />
        </div>
      )}

      {/* ═══════════ TASK MANAGER TAB ═══════════ */}
      {activeTab === 'tasks' && (
        <ZimyoComingSoon
          title="Task Manager"
          description="Assign, track, and review team tasks with priority dashboards and completion trends — aligned with Zimyo task workflows. This module will connect to the HRMS task engine in the next release."
        />
      )}

      {/* ═══════════ EMPLOYEE PROFILE MODAL ═══════════ */}
      <Dialog open={!!selectedMember} onOpenChange={(open) => { if (!open) setSelectedMember(null); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl p-0 bg-white">
          <div className="p-6 border-b border-slate-100 bg-slate-50/40">
            <DialogHeader className="p-0">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 rounded-2xl bg-sgvu-navy/10 text-sgvu-navy font-bold flex items-center justify-center text-base border border-sgvu-navy/10">
                    {selectedMember?.name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <DialogTitle className="text-base font-bold text-sgvu-navy flex items-center gap-2 flex-wrap">
                      {selectedMember?.name}
                      <span className="text-xs text-slate-400 font-semibold">({selectedMember?.empId})</span>
                      {selectedMember?.joiningDate && selectedMember.joiningDate !== '—' &&
                        new Date(selectedMember.probationEnd.replace(/-/g, ' ')).getTime() > Date.now() && (
                        <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-100 font-bold text-[9px] py-0 px-2 hover:bg-emerald-50 rounded-md">On Probation</Badge>
                      )}
                    </DialogTitle>
                    <p className="text-[11px] text-slate-500 font-semibold mt-0.5">{selectedMember?.designation} · {selectedMember?.department} · Permanent</p>
                    <div className="flex flex-wrap gap-4 mt-2 text-[10px] text-slate-500 font-semibold">
                      <span>Joining Date: <b className="text-slate-700">{selectedMember?.joiningDate}</b></span>
                      <span>Probation Completion: <b className="text-slate-700">{selectedMember?.probationEnd}</b></span>
                      <span>Shift Timing: <b className="text-slate-700">{selectedMember?.shiftTiming}</b></span>
                    </div>
                  </div>
                </div>
              </div>
            </DialogHeader>
            <div className="flex gap-5 mt-5 border-b border-slate-200 text-xs font-bold text-slate-400">
              {([{key:'details',label:'Employee Details'},{key:'feedback',label:'Feedback'},{key:'performance',label:'Performance'},{key:'assets',label:'Assigned Assets'}] as {key:ProfileTab;label:string}[]).map(({key,label})=>(
                <button key={key} onClick={()=>setProfileTab(key)} className={`pb-3 border-b-2 transition-all ${profileTab===key?'border-sgvu-navy text-sgvu-navy':'border-transparent hover:text-slate-700'}`}>{label}</button>
              ))}
            </div>
          </div>

          <div className="p-6">
            {/* Employee Details */}
            {profileTab === 'details' && selectedMember && (
              <ZimyoEmployeeOverview
                userId={selectedMember.id}
                memberName={selectedMember.name}
                joiningDate={selectedMember.joiningDate}
                probationEnd={selectedMember.probationEnd}
                shiftTiming={selectedMember.shiftTiming}
              />
            )}

            {/* Feedback */}
            {profileTab === 'feedback' && (
              <ZimyoComingSoon
                title="Feedback & Appreciation"
                description="Appreciation badges, one-on-one notes, and continuous feedback — synced from Zimyo recognition modules."
              />
            )}

            {/* Performance */}
            {profileTab === 'performance' && (
              <ZimyoComingSoon
                title="Performance Reviews"
                description="Review cycles, objectives, and PIP tracking will appear here once connected to the appraisal workflow."
              />
            )}

            {/* Assigned Assets */}
            {profileTab === 'assets' && (
              <ZimyoComingSoon
                title="Assigned Assets"
                description="Laptops, ID cards, and other assets issued to this employee will be listed from the HR asset register."
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}

export default function ReportingDirectoryPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50/50 p-6 flex items-center justify-center text-sm text-slate-500">
          Loading Team HRMS Directory…
        </div>
      }
    >
      <ReportingDirectoryContent />
    </Suspense>
  );
}
