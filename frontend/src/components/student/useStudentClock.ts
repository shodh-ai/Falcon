'use client';

import { useEffect, useState } from 'react';

/** A stable render snapshot that advances when the browser timer fires. */
export function useStudentClock(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}
