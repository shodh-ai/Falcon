'use client';

import { useEffect, useState } from 'react';
import { useAuthedApi } from '@/lib/api';

type Hostel = { hostel_id: string; hostel_name: string; hostel_code: string };

export function HostelScopeBar({
  value,
  onChange,
  allowAll = true,
}: {
  value: string;
  onChange: (hostelId: string) => void;
  allowAll?: boolean;
}) {
  const api = useAuthedApi();
  const [hostels, setHostels] = useState<Hostel[]>([]);

  useEffect(() => {
    void api.get<Hostel[]>('/api/hostel-admin/hostels').then((list) => {
      setHostels(list);
      if (!value && list.length === 1) {
        onChange(list[0].hostel_id);
      } else if (!value && !allowAll && list[0]) {
        onChange(list[0].hostel_id);
      }
    });
  }, [api, allowAll, onChange, value]);

  return (
    <select
      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {allowAll && <option value="">All Accessible Hostels</option>}
      {hostels.map((h) => (
        <option key={h.hostel_id} value={h.hostel_id}>
          {h.hostel_name}
        </option>
      ))}
    </select>
  );
}
