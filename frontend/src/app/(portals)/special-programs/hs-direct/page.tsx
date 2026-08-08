'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useAuthedApi } from '@/lib/api';
import { createSpecialProgramsApi } from '@/lib/api/api.special-programs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/lib/notifications/falcon-toast';

function roleKeys(user: { role?: string; roles?: string[] } | null | undefined) {
  const raw = user?.roles?.length ? user.roles : user?.role ? [user.role] : [];
  return raw.map((r) => r.trim().toLowerCase()).filter(Boolean);
}

export default function Page() {
  const { user } = useAuth();
  const api = useAuthedApi();
  const sp = useMemo(() => createSpecialProgramsApi(api), [api]);
  const [rows, setRows] = useState<any[]>([]);
  const [email, setEmail] = useState('hacker@school.edu');
  const [grade, setGrade] = useState('12');
  const roles = roleKeys(user);
  const canCreate =
    roles.includes('admissionsofficer') ||
    roles.includes('registrar') ||
    roles.includes('dean') ||
    roles.includes('campusadmin') ||
    roles.includes('superadmin');

  const reload = () =>
    sp
      .hsDirect()
      .then(setRows)
      .catch((e) => toast.error(String(e.message ?? e)));

  useEffect(() => {
    void reload();
  }, [sp]);

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-black text-sgvu-navy">HS Direct Admissions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          High-school interception pathway — bypass JEE for whitepaper + GitHub verified leads.
        </p>
      </div>

      {!canCreate && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          You can view leads here. To <strong>add</strong> HS Direct admissions, log in as{' '}
          <strong>Registrar</strong> or <strong>Campus Admin</strong> (
          <code className="text-xs">registrar@mygyanvihar.com</code> /{' '}
          <code className="text-xs">campusadmin@mygyanvihar.com</code>).
        </p>
      )}

      {canCreate && (
        <Card>
          <CardContent className="space-y-3 pt-4">
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Lead email" />
            <Input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="Grade level (11 or 12)" />
            <Button
              onClick={() =>
                sp
                  .createHsDirect({
                    email: email.trim(),
                    grade_level: grade.trim(),
                    checklist: { whitepaper: true, github: true },
                  })
                  .then(() => {
                    toast.success('HS Direct lead added');
                    return reload();
                  })
                  .catch((e) => toast.error(String(e.message ?? e)))
              }
            >
              Add HS Direct lead
            </Button>
          </CardContent>
        </Card>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No HS Direct leads yet.</p>
      ) : (
        rows.map((r) => (
          <Card key={r.flag_id}>
            <CardContent className="pt-4 text-sm">
              {r.email} · grade {r.grade_level} · bypass JEE: {String(r.bypass_jee)}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
