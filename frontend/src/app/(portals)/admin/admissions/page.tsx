'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const columns = [
  { id: 'inquiry', title: 'Inquiry', cards: ['Rahul Verma', 'Ananya Das'] },
  { id: 'doc', title: 'Document Verification', cards: ['Vikram Shah'] },
  { id: 'enrolled', title: 'Enrolled', cards: ['Meera Joshi', 'Arjun Patel'] },
];

export default function AdminAdmissionsPage() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-sgvu-navy">Admissions CRM</h2>
      <p className="text-sm text-muted-foreground">Kanban preview — drag-and-drop wiring comes next (dnd-kit).</p>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((col) => (
          <Card key={col.id} className="min-w-[240px] shrink-0 flex-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{col.title}</CardTitle>
              <CardDescription>{col.cards.length} leads</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {col.cards.map((name) => (
                <div key={name} className="rounded-xl border bg-background p-3 shadow-sm">
                  <p className="font-medium text-sm">{name}</p>
                  <Badge variant="outline" className="mt-2 text-[10px]">
                    B.Tech CSE
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
