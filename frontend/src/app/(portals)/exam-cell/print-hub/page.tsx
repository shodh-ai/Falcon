'use client';

import Link from 'next/link';
import { Printer, Download } from 'lucide-react';
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

export default function ExamCellPrintHubPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <ExamCellPageHeader pageId="print-hub" />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Printer className="h-4 w-4 text-sgvu-gold" />
            Print & export modules
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {EXPORT_LINKS.map((item) => (
            <div key={item.href} className="rounded-lg border p-4">
              <p className="font-medium text-sgvu-navy">{item.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.desc}</p>
              <Button asChild size="sm" variant="outline" className="mt-3">
                <Link href={item.href}><Download className="mr-2 h-3 w-3" />Open module</Link>
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
