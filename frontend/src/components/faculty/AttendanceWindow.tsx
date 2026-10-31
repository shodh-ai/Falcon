'use client';

import { useEffect, useState } from 'react';

export function AttendanceWindow({ deadline, reopened, onExpired }: {
  deadline: string | null; reopened: boolean; onExpired: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const expires = deadline ? Date.parse(deadline) : NaN;
  useEffect(() => {
    if (!Number.isFinite(expires)) return;
    const tick = () => {
      const time = Date.now();
      setNow(time);
      if (time >= expires) onExpired();
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [expires, onExpired]);
  if (!Number.isFinite(expires)) return null;
  const minutes = Math.max(0, Math.ceil((expires - now) / 60000));
  return <p className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950">
    {reopened ? 'HOD-approved correction window' : 'Attendance submission window'}: {Math.floor(minutes / 60)}h {minutes % 60}m remaining.
    {' '}Closes {new Date(expires).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST.
    {reopened && ' Corrections are audited.'}
  </p>;
}
