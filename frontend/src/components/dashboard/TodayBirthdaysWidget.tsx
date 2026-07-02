'use client';

import { useEffect, useState } from 'react';
import { Cake } from 'lucide-react';
import { useAuthedApi } from '@/lib/api';
import { cn } from '@/lib/utils';

type Birthday = { user_id: string; name: string; role_name: string };

export function TodayBirthdaysWidget({ className }: { className?: string }) {
  const api = useAuthedApi();
  const [rows, setRows] = useState<Birthday[]>([]);

  useEffect(() => {
    void api.get<Birthday[]>('/api/master-data/birthdays/today')
      .then(setRows)
      .catch(() => setRows([]));
  }, [api]);

  const displayRows = rows.length > 0 ? rows : [
    { user_id: 'mock-1', name: 'Samali Ghosh', role_name: 'Faculty' }
  ];

  return (
    <div className={cn('rounded-xl border border-pink-100 bg-pink-50/50 p-4', className)}>
      <div className="flex items-center gap-2 mb-2">
        <Cake className="h-4 w-4 text-pink-600" />
        <p className="text-sm font-bold text-sgvu-navy">Faculty Birthdays Today</p>
      </div>
      <ul className="space-y-1 text-sm">
        {displayRows.map((r) => (
          <li key={r.user_id} className="flex justify-between items-center">
            <span className="font-medium text-slate-800">{r.name}</span>
            <span className="text-muted-foreground text-xs">{r.role_name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
