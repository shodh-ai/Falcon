'use client';

import Link from 'next/link';
import { Printer } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ExamCellPageHeader } from '@/components/exam-cell/ExamCellPageHeader';

const EXPORT_LINKS = [
  { label: 'Hall tickets (Admit Cards)', href: '/exam-cell/admit-cards', desc: 'Generate and audit hall tickets with eligibility checks' },
  { label: 'Seating charts', href: '/exam-cell/seating-plans', desc: 'Published seating plans for printing' },
  { label: 'Invigilation duty roster', href: '/exam-cell/invigilation', desc: 'Faculty duty assignments by room and date' },
  { label: 'Grade cards & merit list', href: '/exam-cell/grade-cards', desc: 'Semester grade cards and top students' },
  { label: 'Transcripts & certificates', href: '/exam-cell/transcripts', desc: 'Degree transcripts and provisional certificates' },
  { label: 'Examination reports', href: '/exam-cell/reports', desc: 'Pass percentage, rankers, and department analysis' },
];

const btnPrimary =
  'mt-3 border border-[#0B2447] bg-[#0B2447] text-white transition-colors hover:bg-[#123A6D] hover:text-white active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy';

export default function ExamCellPrintHubPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <ExamCellPageHeader pageId="print-hub" />
        </CardContent>
      </Card>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-sgvu-navy">
            <Printer className="h-4 w-4 text-sgvu-gold" />
            Print & export modules
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {EXPORT_LINKS.map((item) => (
            <div key={item.href} className="rounded-lg border border-sgvu-navy/10 p-4">
              <p className="font-medium text-sgvu-navy">{item.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.desc}</p>
              <Button asChild size="sm" variant="outline" className={btnPrimary}>
                <Link href={item.href}>Open module</Link>
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
