'use client';

import { useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Loader2, PlayCircle, Clock, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import {
  StudentPageHeader,
} from '@/components/student/StudentPageHeader';
import {
  StudentPageShell,
} from '@/components/student/StudentPageShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';

type WeeklyTest = {
  test_id: string;
  course_id: string;
  course_code: string;
  course_name: string;
  test_type: string;
  start_time: string;
  end_time: string;
  status: string;
  is_active: boolean;
  submitted_at?: string | null;
};

export default function StudentWeeklyTestsPage() {
  const api = useAuthedApi();
  const [tests, setTests] = useState<WeeklyTest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await api.get<WeeklyTest[]>('/api/weekly-tests/student/available');
        if (!cancelled) {
          setTests(data);
        }
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : 'Failed to load tests');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [api]);

  return (
    <StudentPageShell>
      <StudentPageHeader
        title="Weekly Tests"
        description="Access and attempt your scheduled WT1 and WT2 assessments here. These tests are strictly proctored via full-screen enforcement."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Available Tests</CardTitle>
          <p className="text-sm text-muted-foreground">Tests must be attempted within their scheduled time window.</p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : tests.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <p>No active or scheduled tests found.</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {tests.map(test => {
                const startTime = new Date(test.start_time);
                const endTime = new Date(test.end_time);
                const now = new Date();
                
                const isCompleted = test.status === 'COMPLETED' || now > endTime;
                const isOngoing = !isCompleted && now >= startTime && now <= endTime;
                const isUpcoming = !isCompleted && now < startTime;
                const isInactive = test.is_active === false;
                const isAttempted = Boolean(test.submitted_at);
                
                return (
                  <div key={test.test_id} className={`rounded-xl border p-4 flex flex-col gap-3 ${(isCompleted || isInactive) && !isAttempted ? 'opacity-60 bg-muted/20 grayscale' : ''}`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-sgvu-navy">{test.course_code}</span>
                          <Badge variant="outline">{test.test_type}</Badge>
                        </div>
                        <p className="text-sm font-medium text-sgvu-navy">{test.course_name}</p>
                      </div>
                      {isInactive ? (
                        <Badge variant="secondary" className="bg-orange-100 text-orange-800 border-orange-200">Inactive</Badge>
                      ) : isOngoing ? (
                        <Badge variant="destructive" className="animate-pulse">Live Now</Badge>
                      ) : isUpcoming ? (
                        <Badge variant="secondary">Upcoming</Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">Unavailable</Badge>
                      )}
                    </div>
                    
                      <div className="text-xs text-muted-foreground bg-muted/30 p-2 rounded flex items-center gap-2">
                        <Clock className="w-4 h-4 shrink-0" />
                        <div>
                          <p>Starts: {startTime.toLocaleString()}</p>
                          <p>Ends: {endTime.toLocaleString()}</p>
                        </div>
                      </div>
                    
                    <div className="mt-auto pt-2 flex justify-end">
                      {isAttempted ? (
                        <Button variant="secondary" disabled>
                          <CheckCircle2 className="w-4 h-4 mr-2" />
                          Attempted
                        </Button>
                      ) : isInactive ? (
                        <Button variant="secondary" onClick={() => toast.error("This test is currently inactive")}>
                          <PlayCircle className="w-4 h-4 mr-2" />
                          Inactive
                        </Button>
                      ) : isCompleted ? (
                        <Button variant="secondary" onClick={() => toast.error("This test is now unavailable")}>
                          <PlayCircle className="w-4 h-4 mr-2" />
                          Unavailable
                        </Button>
                      ) : isUpcoming ? (
                        <Button variant="secondary" onClick={() => toast.error("Test has not started yet")}>
                          <PlayCircle className="w-4 h-4 mr-2" />
                          Not Started
                        </Button>
                      ) : (
                        <Button asChild disabled={!isOngoing}>
                          <Link href={`/student/weekly-tests/attempt/${test.test_id}`}>
                            <PlayCircle className="w-4 h-4 mr-2" />
                            Attempt Test
                          </Link>
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </StudentPageShell>
  );
}
