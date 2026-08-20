'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useAuthedApi } from '@/lib/api';

const BRAND_BTN =
  'border border-[#0B2447] bg-[#0B2447] text-white transition-colors hover:bg-[#123A6D] hover:text-white active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy';

type ScholarStatus =
  | 'Coursework'
  | 'Synopsis Submitted'
  | 'Thesis Defended'
  | 'Degree Awarded'
  | string;

type PhdScholar = {
  id: string;
  name: string;
  topic: string;
  guide: string;
  department: string;
  status: ScholarStatus;
};

type ResearchScholarRow = {
  scholar_id?: string;
  enrollment_no?: string;
  scholar_name?: string;
  guide_name?: string;
  research_topic?: string;
  topic?: string;
  department_name?: string;
  dept_name?: string;
  current_phase?: string;
  status?: string;
};

function mapPhaseToStatus(phase?: string | null): ScholarStatus {
  const p = (phase ?? '').trim().toLowerCase();
  if (!p) return 'Coursework';
  if (p.includes('award') || p.includes('degree')) return 'Degree Awarded';
  if (p.includes('defend') || p.includes('viva') || p.includes('thesis')) {
    return 'Thesis Defended';
  }
  if (p.includes('synopsis')) return 'Synopsis Submitted';
  if (p.includes('course')) return 'Coursework';
  return phase ?? 'Coursework';
}
function statusBadgeClass(status: ScholarStatus) {
  switch (status) {
    case 'Coursework':
      return 'border-transparent bg-slate-100 text-slate-700';
    case 'Synopsis Submitted':
      return 'border-transparent bg-amber-100 text-amber-800';
    case 'Thesis Defended':
      return 'border-transparent bg-blue-100 text-blue-800';
    case 'Degree Awarded':
      return 'border-transparent bg-emerald-100 text-emerald-800';
    default:
      return 'border-transparent bg-slate-100 text-slate-700';
  }
}

export default function RegistrarPhdAdmissionsPage() {
  const api = useAuthedApi();
  const [query, setQuery] = useState('');
  const [scholars, setScholars] = useState<PhdScholar[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedScholar, setSelectedScholar] = useState<PhdScholar | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const rows = await api.get<ResearchScholarRow[]>('/api/research/scholars');
        if (cancelled) return;
        setScholars(
          (rows ?? []).map((row) => ({
            id:
              row.enrollment_no ||
              row.scholar_id ||
              '—',
            name: row.scholar_name || 'Unnamed scholar',
            topic: row.research_topic || row.topic || '—',
            guide: row.guide_name || '—',
            department: row.department_name || row.dept_name || '—',
            status: mapPhaseToStatus(row.current_phase || row.status),
          })),
        );
      } catch (err) {
        if (cancelled) return;
        setScholars([]);
        setLoadError(
          err instanceof Error ? err.message : 'Failed to load research scholars',
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return scholars;
    return scholars.filter(
      (row) =>
        row.name.toLowerCase().includes(q) ||
        row.id.toLowerCase().includes(q) ||
        row.topic.toLowerCase().includes(q),
    );
  }, [query, scholars]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6" data-testid="phd-admissions-page">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="space-y-5 p-5 md:p-6">
          <div>
            <h1 className="text-2xl font-bold text-sgvu-navy">Ph.D. Admissions & Awards</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Verify documents, track scholar progress, and award doctoral degrees.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full max-w-md">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search scholar name or topic..."
                className="h-11 rounded-xl border-sgvu-navy/15 bg-white pl-9"
                aria-label="Search scholar name or topic"
              />
            </div>
            <Button type="button" className={cn('h-11 shrink-0', BRAND_BTN)} disabled title="Coming soon">
              Add Ph.D. Scholar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="bg-slate-50/80 pl-5">Scholar Name & ID</TableHead>
                <TableHead className="bg-slate-50/80">Research Topic</TableHead>
                <TableHead className="bg-slate-50/80">Guide / Mentor Name</TableHead>
                <TableHead className="bg-slate-50/80">Department</TableHead>
                <TableHead className="bg-slate-50/80">Status</TableHead>
                <TableHead className="bg-slate-50/80 pr-5 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                    Loading scholars…
                  </TableCell>
                </TableRow>
              ) : loadError ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                    {loadError}
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                    No Ph.D. scholars on record yet.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((scholar) => (
                  <TableRow key={scholar.id} className="border-sgvu-navy/5">
                    <TableCell className="pl-5">
                      <div className="min-w-[160px]">
                        <p className="font-semibold text-sgvu-navy">{scholar.name}</p>
                        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                          {scholar.id}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="max-w-[280px] leading-relaxed text-sgvu-navy/80">
                        {scholar.topic}
                      </p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sgvu-navy/80">
                      {scholar.guide}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sgvu-navy/80">
                      {scholar.department}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn('font-medium', statusBadgeClass(scholar.status))}
                      >
                        {scholar.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="pr-5 text-right">
                      <Button
                        type="button"
                        size="sm"
                        className={cn('h-9 px-4', BRAND_BTN)}
                        onClick={() => {
                          setSelectedScholar(scholar);
                          setDetailsOpen(true);
                        }}
                      >
                        View Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog
        open={detailsOpen}
        onOpenChange={(open) => {
          setDetailsOpen(open);
          if (!open) setSelectedScholar(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ph.D. Scholar Details</DialogTitle>
            <DialogDescription>
              Read-only overview from the research scholars listing.
            </DialogDescription>
          </DialogHeader>

          {selectedScholar ? (
            <div className="space-y-3 text-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-sgvu-navy">{selectedScholar.name}</p>
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground">{selectedScholar.id}</p>
                </div>
                <Badge
                  variant="outline"
                  className={cn('font-medium', statusBadgeClass(selectedScholar.status))}
                >
                  {selectedScholar.status}
                </Badge>
              </div>

              <div className="grid gap-2 rounded-lg border p-3">
                <p>
                  <span className="text-muted-foreground">Topic: </span>
                  <span className="font-medium text-sgvu-navy">{selectedScholar.topic}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Guide: </span>
                  <span className="font-medium text-sgvu-navy">{selectedScholar.guide}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Department: </span>
                  <span className="font-medium text-sgvu-navy">{selectedScholar.department}</span>
                </p>
              </div>
            </div>
          ) : (
            <div className="py-6 text-sm text-muted-foreground">No scholar selected.</div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDetailsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
