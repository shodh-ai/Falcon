'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
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

const BRAND_BTN =
  'border border-[#0B2447] bg-[#0B2447] text-white transition-colors hover:bg-[#123A6D] hover:text-white active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy';

type ScholarStatus =
  | 'Coursework'
  | 'Synopsis Submitted'
  | 'Thesis Defended'
  | 'Degree Awarded';

type PhdScholar = {
  id: string;
  name: string;
  topic: string;
  guide: string;
  department: string;
  status: ScholarStatus;
};

const DUMMY_SCHOLARS: PhdScholar[] = [
  {
    id: 'PHD-2024-0142',
    name: 'Ananya Sharma',
    topic: 'Edge-aware federated learning for campus IoT telemetry',
    guide: 'Dr. Meera Krishnan',
    department: 'Computer Science',
    status: 'Coursework',
  },
  {
    id: 'PHD-2023-0087',
    name: 'Rohan Mehta',
    topic: 'Sustainable materials for high-strength concrete composites',
    guide: 'Prof. Suresh Iyer',
    department: 'Civil Engineering',
    status: 'Synopsis Submitted',
  },
  {
    id: 'PHD-2022-0031',
    name: 'Priya Nair',
    topic: 'Pharmacokinetic modelling of plant-derived antimicrobials',
    guide: 'Dr. Kavita Rao',
    department: 'Pharmaceutical Sciences',
    status: 'Thesis Defended',
  },
  {
    id: 'PHD-2021-0019',
    name: 'Aarav Patel',
    topic: 'Governance analytics for multi-campus academic quality',
    guide: 'Prof. Neha Gupta',
    department: 'Management Studies',
    status: 'Degree Awarded',
  },
  {
    id: 'PHD-2024-0158',
    name: 'Ishita Verma',
    topic: 'Low-latency speech translation for regional classrooms',
    guide: 'Dr. Arjun Desai',
    department: 'Electronics & Communication',
    status: 'Coursework',
  },
  {
    id: 'PHD-2023-0112',
    name: 'Kabir Singh',
    topic: 'Climate-resilient irrigation scheduling with remote sensing',
    guide: 'Prof. Lakshmi Reddy',
    department: 'Agricultural Engineering',
    status: 'Synopsis Submitted',
  },
];

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
  }
}

export default function RegistrarPhdAdmissionsPage() {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return DUMMY_SCHOLARS;
    return DUMMY_SCHOLARS.filter(
      (row) =>
        row.name.toLowerCase().includes(q) ||
        row.id.toLowerCase().includes(q) ||
        row.topic.toLowerCase().includes(q),
    );
  }, [query]);

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
            <Button
              type="button"
              className={cn('h-11 shrink-0', BRAND_BTN)}
              onClick={() => toast.info('Add Ph.D. Scholar — coming soon')}
            >
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
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                    No scholars match your search.
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
                        onClick={() => toast.info(`Viewing ${scholar.name}`)}
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
    </div>
  );
}
