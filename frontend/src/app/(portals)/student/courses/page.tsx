'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const electives = [
  { id: 'ml', name: 'Machine Learning', credits: 3, selected: false },
  { id: 'cloud', name: 'Cloud Computing', credits: 3, selected: true },
  { id: 'iot', name: 'IoT Systems', credits: 3, selected: false },
  { id: 'blockchain', name: 'Blockchain Basics', credits: 2, selected: true },
];

export default function StudentCoursesPage() {
  const [selected, setSelected] = useState<Record<string, boolean>>(
    Object.fromEntries(electives.map((e) => [e.id, e.selected])),
  );

  const toggle = (id: string) => setSelected((s) => ({ ...s, [id]: !s[id] }));

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h2 className="text-xl font-bold text-sgvu-navy">Course Registration (CBCS)</h2>
      <Card>
        <CardHeader>
          <CardTitle>Semester 4 electives</CardTitle>
          <CardDescription>Select up to 12 credits · checklist updates instantly</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {electives.map((course) => (
            <button
              key={course.id}
              type="button"
              onClick={() => toggle(course.id)}
              className={cn(
                'flex w-full items-center justify-between rounded-xl border p-4 text-left transition touch-target',
                selected[course.id] ? 'border-sgvu-gold bg-accent' : 'hover:bg-muted/50',
              )}
            >
              <span>
                <span className="font-medium text-sgvu-navy">{course.name}</span>
                <span className="block text-xs text-muted-foreground">{course.credits} credits</span>
              </span>
              <span
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-md border-2 text-xs font-bold',
                  selected[course.id] ? 'border-sgvu-navy bg-sgvu-navy text-white' : 'border-muted-foreground',
                )}
              >
                {selected[course.id] ? '✓' : ''}
              </span>
            </button>
          ))}
          <Button className="w-full" size="lg">
            Submit registration
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
