'use client';

import { useEffect, useState } from 'react';
import { Cake } from 'lucide-react';
import { useAuthedApi } from '@/lib/api';
import { cn } from '@/lib/utils';

type Birthday = { user_id: string; name: string; role_name: string };

export function TodayBirthdaysWidget({
  className,
  endpoint = '/api/master-data/birthdays/today',
  title = "Today's Birthdays",
}: {
  className?: string;
  endpoint?: string;
  title?: string;
}) {
  const api = useAuthedApi();
  const [rows, setRows] = useState<Birthday[]>([]);

  useEffect(() => {
    void api.get<Birthday[]>(endpoint).then(setRows).catch(() => setRows([]));
  }, [api, endpoint]);

  if (!rows.length) return null;

  return (
    <div className={cn('rounded-xl border border-pink-200 bg-pink-50/80 p-4', className)}>
      <div className="flex items-center gap-2 mb-2">
        <Cake className="h-4 w-4 text-pink-600" />
        <p className="text-sm font-bold text-sgvu-navy">{title}</p>
      </div>
      <ul className="space-y-1 text-sm">
        {rows.map((r) => (
          <li key={r.user_id} className="flex justify-between gap-2">
            <span className="font-medium text-sgvu-navy">{r.name}</span>
            <span className="text-muted-foreground text-xs">{r.role_name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
