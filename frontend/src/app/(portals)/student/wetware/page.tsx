'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useAuthedApi } from '@/lib/api';
import { createSpecialProgramsApi } from '@/lib/api/api.special-programs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/notifications/falcon-toast';

export default function Page() {
  const { user } = useAuth();
  const api = useAuthedApi();
  const sp = useMemo(() => createSpecialProgramsApi(api), [api]);
  const [program, setProgram] = useState<any>(null);
  const [myEnrollment, setMyEnrollment] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    return sp
      .list()
      .then((all) => {
        const p = all.find((x) => x.code === 'WETWARE_BIOTECH');
        setProgram(p);
        if (!p) {
          setMyEnrollment(null);
          return;
        }
        return sp.enrollments('WETWARE_BIOTECH').then((rows) => {
          const mine = rows.find((e) => e.student_user_id === user?.user_id);
          setMyEnrollment(mine ?? null);
        });
      })
      .catch(() => toast.error('Failed to load Wetware program'))
      .finally(() => setLoading(false));
  }, [sp, user?.user_id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const enrolled = Boolean(myEnrollment);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-black text-sgvu-navy">Wetware Biotech</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          First-principles biology track — BSL-1 lab access, BioBricks kits, and wet-lab
          capstones alongside hardware and software builds.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {program?.name ?? 'First-Principles Biotech (Wetware)'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {program?.description ??
              'Enroll to join the Wetware BioBricks cohort and access the MIT-Killer biotech pathway.'}
          </p>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : enrolled ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
              Enrolled — status: {myEnrollment.status}
            </p>
          ) : program ? (
            <Button
              size="sm"
              onClick={() =>
                sp
                  .enroll({
                    program_id: program.program_id,
                    metadata: { track: 'BioBricks' },
                  })
                  .then(() => {
                    toast.success('Enrolled in Wetware Biotech (BioBricks track)');
                    return reload();
                  })
                  .catch((e) => toast.error(String(e.message ?? e)))
              }
            >
              Enroll in Wetware
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">Program not configured for this tenant.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
