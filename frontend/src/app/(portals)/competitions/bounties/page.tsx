'use client';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useAuthedApi } from '@/lib/api';
import { createCompetitionsApi } from '@/lib/api/api.competitions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/notifications/falcon-toast';

function roleKeys(user: { role?: string; roles?: string[] } | null | undefined) {
  const raw = user?.roles?.length ? user.roles : user?.role ? [user.role] : [];
  return raw.map((r) => r.trim().toLowerCase()).filter(Boolean);
}

function assertBountyRow(result: unknown, fallbackMessage: string) {
  const row = result as { bounty_id?: string } | null | undefined;
  if (!row?.bounty_id) throw new Error(fallbackMessage);
  return row;
}

export default function Page() {
  const { user } = useAuth();
  const api = useAuthedApi();
  const c = useMemo(() => createCompetitionsApi(api), [api]);
  const [rows, setRows] = useState<any[]>([]);
  const roles = roleKeys(user);
  const canClaim = roles.includes('student') || roles.includes('superadmin');
  const canPay =
    roles.includes('competitionadmin') ||
    roles.includes('accountant') ||
    roles.includes('superadmin');
  const canReopen = roles.includes('competitionadmin') || roles.includes('superadmin');

  const reload = () =>
    c
      .bounties()
      .then(setRows)
      .catch(() => toast.error('Load failed'));

  useEffect(() => {
    void reload();
  }, [c]);

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-black text-sgvu-navy">Bounties</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Students claim open bounties; Competition Admin marks them paid after review.
        </p>
      </div>

      {!canClaim && canPay && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          You are viewing as admin. To test <strong>Claim</strong>, log in as a student and open{' '}
          <strong>Student → Tokamak Challenges</strong> (bounties section).
        </p>
      )}

      {rows.map((b) => (
        <Card key={b.bounty_id}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {b.title} — ₹{Number(b.reward_inr).toLocaleString('en-IN')}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold uppercase">
              {b.status}
            </span>
            {b.claimed_by_name && (
              <span className="text-sm text-muted-foreground">Claimed by {b.claimed_by_name}</span>
            )}
            {b.status === 'OPEN' && canClaim && (
              <Button
                size="sm"
                onClick={() =>
                  c
                    .claimBounty(b.bounty_id)
                    .then((result) => {
                      assertBountyRow(result, 'Bounty not available');
                      toast.success('Bounty claimed');
                      return reload();
                    })
                    .catch((err) => toast.error(String(err.message ?? err)))
                }
              >
                Claim
              </Button>
            )}
            {b.status === 'CLAIMED' && canPay && (
              <Button
                size="sm"
                onClick={() =>
                  c
                    .payBounty(b.bounty_id)
                    .then((result) => {
                      assertBountyRow(result, 'Bounty must be claimed before marking paid');
                      toast.success('Bounty marked paid');
                      return reload();
                    })
                    .catch((err) => toast.error(String(err.message ?? err)))
                }
              >
                Mark Paid
              </Button>
            )}
            {(b.status === 'CLAIMED' || b.status === 'PAID') && canReopen && (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  c
                    .reopenBounty(b.bounty_id)
                    .then((result) => {
                      assertBountyRow(result, 'Bounty is already open');
                      toast.success('Bounty reopened for students');
                      return reload();
                    })
                    .catch((err) => toast.error(String(err.message ?? err)))
                }
              >
                Reopen
              </Button>
            )}
            {b.status === 'PAID' && (
              <span className="text-sm font-medium text-emerald-700">Paid out</span>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
