'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuthedApi } from '@/lib/api';
import { Download, Trash2, Eye } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type Schedule = { exam_schedule_id: string; exam_type: string; exam_date: string; venue: string; subject_name?: string; subject_code?: string };
type Hall = { name: string; capacity: number; rows: number; cols: number };
type Block = { block: string; halls: Hall[] };
type SeatingAllocation = {
  student_name: string;
  student_user_id: string;
  branch_code: string;
  subject_name?: string | null;
  exam_date?: string | null;
  room: string;
  seat_number: string;
};
type SeatingRun = {
  run_id: string;
  allocation_strategy: string;
  exam_type?: string | null;
  exam_schedule_id?: string | null;
  semester: number;
  branch: string;
  created_at: string;
  total_allocated: number;
  allocations: SeatingAllocation[];
  subject_name?: string | null;
  exam_date?: string | null;
};

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}

export default function ExamCellSeatingPage() {
  const api = useAuthedApi();
  const [strategy, setStrategy] = useState<'by_exam_type' | 'by_schedule'>('by_exam_type');
  
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [blocksData, setBlocksData] = useState<Block[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  
  const [examType, setExamType] = useState('MID_TERM');
  const [examId, setExamId] = useState('');
  const [semester, setSemester] = useState('4');
  const [branch, setBranch] = useState('All Branches');
  
  const [selectedBlock, setSelectedBlock] = useState('');
  const [selectedHalls, setSelectedHalls] = useState<string[]>([]);
  
  const [runs, setRuns] = useState<SeatingRun[]>([]);
  const [viewingRun, setViewingRun] = useState<SeatingRun | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadInitial() {
      setLoading(true);
      try {
        const [scheduleRows, blockRows] = await Promise.all([
          api.get<Schedule[]>('/api/exam-cell/schedules'),
          api.get<Block[]>('/api/exam-cell/blocks-halls'),
        ]);
        if (cancelled) return;

        const nextSchedules = asArray<Schedule>(scheduleRows);
        const nextBlocks = asArray<Block>(blockRows);
        setSchedules(nextSchedules);
        setBlocksData(nextBlocks);
        if (nextSchedules[0]) setExamId(nextSchedules[0].exam_schedule_id);
        if (nextBlocks[0]?.block) setSelectedBlock(nextBlocks[0].block);
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : 'Could not load seating planner data');
          setSchedules([]);
          setBlocksData([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadInitial();
    return () => {
      cancelled = true;
    };
  }, [api]);

  useEffect(() => {
    if (!semester) return;
    let cancelled = false;

    async function loadBranches() {
      try {
        const rows = await api.get<string[]>(`/api/exam-cell/branches?semester=${semester}`);
        if (!cancelled) setBranches(asArray<string>(rows));
      } catch {
        if (!cancelled) setBranches([]);
      }
    }

    void loadBranches();
    return () => {
      cancelled = true;
    };
  }, [api, semester]);

  const loadRuns = useCallback(async () => {
    try {
      const rows = await api.get<SeatingRun[]>('/api/exam-cell/seating-runs');
      setRuns(
        asArray<SeatingRun>(rows).map((run) => ({
          ...run,
          allocations: asArray<SeatingAllocation>(run.allocations),
          total_allocated: Number(run.total_allocated ?? run.allocations?.length ?? 0),
        })),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load seating runs');
      setRuns([]);
    }
  }, [api]);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  async function allocate() {
    try {
      const res = await api.post<{ allocated: number }>('/api/exam-cell/seating/auto-allocate', {
        allocation_strategy: strategy,
        exam_type: strategy === 'by_exam_type' ? examType : undefined,
        exam_schedule_id: strategy === 'by_schedule' ? examId : undefined,
        semester: Number(semester),
        branch: branch,
        rooms: selectedHalls,
      });
      toast.success(`Allocated ${res.allocated} seats across rooms`);
      await loadRuns();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Allocation failed');
    }
  }

  async function deleteRun(runId: string) {
    if (!confirm('Are you sure you want to delete this run?')) return;
    try {
      await api.del(`/api/exam-cell/seating-runs/${runId}`);
      toast.success('Run deleted');
      await loadRuns();
    } catch (e) {
      toast.error('Failed to delete run');
    }
  }

  function exportPDF(run: SeatingRun) {
    const allocations = asArray<SeatingAllocation>(run.allocations);
    const doc = new jsPDF();
    doc.text(`Seating Plan - ${run.allocation_strategy === 'by_exam_type' ? 'Entire Exam' : 'Specific Schedule'}`, 14, 15);
    
    const tableData = allocations.map((a) => [
      a.student_name,
      `${a.student_user_id.split('-')[0]} (${a.branch_code})`,
      ...(run.allocation_strategy === 'by_schedule' ? [a.subject_name || 'N/A', a.exam_date ? String(a.exam_date).slice(0, 10) : 'N/A'] : []),
      `${a.room} - Seat ${a.seat_number}`
    ]);
    
    const head = [
      ['Student Name', 'ID (Branch)', ...(run.allocation_strategy === 'by_schedule' ? ['Subject Name', 'Date'] : []), 'Seat No (Room)']
    ];

    autoTable(doc, { head, body: tableData, startY: 20 });
    doc.save(`seating-plan-${run.run_id.slice(0, 8)}.pdf`);
  }

  const currentBlockHalls = blocksData.find(b => b.block === selectedBlock)?.halls || [];

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-4 md:p-6">
      <div>
        <p className="text-sm font-semibold text-sgvu-gold">Falcon Exam OS</p>
        <h1 className="text-2xl font-bold text-sgvu-navy">Seating Planner</h1>
        <p className="text-sm text-muted-foreground">Auto-allocate ensures adjacent seats are not the same branch.</p>
        {loading ? <p className="mt-2 text-xs text-muted-foreground">Loading exam schedules and halls…</p> : null}
      </div>

      <div className="flex gap-4 border-b pb-4">
        <Button variant={strategy === 'by_exam_type' ? 'default' : 'outline'} onClick={() => setStrategy('by_exam_type')}>Entire Exam (By Type)</Button>
        <Button variant={strategy === 'by_schedule' ? 'default' : 'outline'} onClick={() => setStrategy('by_schedule')}>Specific Schedule</Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Allocation Parameters</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {strategy === 'by_exam_type' ? (
              <div className="space-y-1">
                <label className="text-sm font-medium">Exam Type</label>
                <select className="w-full rounded-md border px-3 py-2 text-sm" value={examType} onChange={(e) => setExamType(e.target.value)}>
                  <option value="MID_TERM">Mid Term</option>
                  <option value="END_TERM">End Term</option>
                </select>
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-sm font-medium">Exam Schedule</label>
                <select className="w-full rounded-md border px-3 py-2 text-sm" value={examId} onChange={(e) => setExamId(e.target.value)}>
                  {schedules.map((s) => (
                    <option key={s.exam_schedule_id} value={s.exam_schedule_id}>
                      {s.subject_name ? `${s.subject_name} (${s.subject_code})` : s.exam_type} · {String(s.exam_date).slice(0, 10)}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-1">
              <label className="text-sm font-medium">Semester</label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={semester} onChange={(e) => setSemester(e.target.value)}>
                {[1,2,3,4,5,6,7,8].map(s => <option key={s} value={s}>Semester {s}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Branch</label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={branch} onChange={(e) => setBranch(e.target.value)}>
                <option value="All Branches">All Branches</option>
                {branches.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Block</label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={selectedBlock} onChange={(e) => { setSelectedBlock(e.target.value); setSelectedHalls([]); }}>
                {blocksData.map((b) => <option key={b.block} value={b.block}>{b.block}</option>)}
              </select>
            </div>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">Select Halls in {selectedBlock}</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {currentBlockHalls.map(h => (
                <label key={h.name} className="flex items-center space-x-2 border rounded-md p-2 text-sm cursor-pointer hover:bg-muted/50">
                  <input type="checkbox" checked={selectedHalls.includes(h.name)} onChange={(e) => {
                    if (e.target.checked) setSelectedHalls([...selectedHalls, h.name]);
                    else setSelectedHalls(selectedHalls.filter(x => x !== h.name));
                  }} />
                  <span>{h.name} <span className="text-muted-foreground text-xs">({h.rows}x{h.cols})</span></span>
                </label>
              ))}
            </div>
          </div>

          <Button className="w-full" onClick={() => void allocate()} disabled={selectedHalls.length === 0}>
            Auto-allocate seats
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-sgvu-navy">Seating Plan History</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground bg-muted p-4 rounded-md">No seating plans generated yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {runs.map(r => (
              <Card key={r.run_id} className="flex flex-col">
                <CardHeader className="flex flex-row items-start justify-between pb-2 space-y-0">
                  <div className="space-y-1">
                    <CardTitle className="text-sm font-medium">
                      {r.allocation_strategy === 'by_exam_type' ? 'Entire Exam' : 'Specific Schedule'}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => exportPDF(r)} className="text-muted-foreground hover:text-sgvu-navy transition-colors" title="Export PDF">
                      <Download className="h-4 w-4" />
                    </button>
                    <button onClick={() => void deleteRun(r.run_id)} className="text-muted-foreground hover:text-red-600 transition-colors" title="Delete">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col flex-1 justify-between gap-4">
                  <div className="text-sm space-y-1.5 text-muted-foreground">
                    <p><strong className="text-foreground font-medium">Semester:</strong> {r.semester}</p>
                    <p><strong className="text-foreground font-medium">Branch:</strong> {r.branch}</p>
                    {r.allocation_strategy === 'by_schedule' && (
                      <>
                        <p className="truncate"><strong className="text-foreground font-medium">Subject:</strong> {r.subject_name || 'N/A'}</p>
                        <p><strong className="text-foreground font-medium">Date:</strong> {r.exam_date ? String(r.exam_date).slice(0, 10) : 'N/A'}</p>
                      </>
                    )}
                    <p><strong className="text-foreground font-medium">Total Allocated:</strong> <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-xs">{r.total_allocated} seats</span></p>
                  </div>
                  <Button variant="secondary" size="sm" className="w-full mt-auto" onClick={() => setViewingRun(r)}>
                    <Eye className="h-4 w-4 mr-2" /> View Details
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!viewingRun} onOpenChange={(open) => !open && setViewingRun(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Seating Plan Details</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            {viewingRun && (
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-background z-10">
                  <tr className="border-b">
                    <th className="py-2">Student Name</th>
                    <th className="py-2">ID (Branch)</th>
                    {viewingRun.allocation_strategy === 'by_schedule' && (
                      <>
                        <th className="py-2">Subject Name</th>
                        <th className="py-2">Date</th>
                      </>
                    )}
                    <th className="py-2">Seat No (Room)</th>
                  </tr>
                </thead>
                <tbody>
                  {asArray<SeatingAllocation>(viewingRun.allocations).map((a, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                      <td className="py-2">{a.student_name}</td>
                      <td className="py-2 text-muted-foreground">{a.student_user_id.split('-')[0]} ({a.branch_code})</td>
                      {viewingRun.allocation_strategy === 'by_schedule' && (
                        <>
                          <td className="py-2">{a.subject_name || 'N/A'}</td>
                          <td className="py-2">{a.exam_date ? String(a.exam_date).slice(0, 10) : 'N/A'}</td>
                        </>
                      )}
                      <td className="py-2 font-mono text-xs">{a.room} - Seat {a.seat_number}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

