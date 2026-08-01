'use client';
import { useEffect, useMemo, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { createCompetitionsApi } from '@/lib/api/api.competitions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/notifications/falcon-toast';

export default function Page() {
  const api = useAuthedApi();
  const c = useMemo(() => createCompetitionsApi(api), [api]);
  const [list, setList] = useState<any[]>([]);
  const [bounties, setBounties] = useState<any[]>([]);

  const reloadBounties = () =>
    c
      .bounties()
      .then(setBounties)
      .catch(() => toast.error('Failed to load bounties'));

  useEffect(() => {
    void c.list().then(setList).catch(() => toast.error('Load failed'));
    void reloadBounties();
  }, [c]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-black text-sgvu-navy">Tokamak Challenges</h1>
        <p className="text-sm text-muted-foreground">
          Submit a whitepaper URL to enter the Gladiator funnel, or claim paid Shodh bounties.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-sgvu-navy">Gladiator competitions</h2>
        {list.map((x) => (
          <Card key={x.competition_id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{x.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <Button
                size="sm"
                onClick={() =>
                  c
                    .submit({
                      competition_id: x.competition_id,
                      whitepaper_url: 'https://example.com/whitepaper.pdf',
                      applicant_name: 'Student Applicant',
                    })
                    .then(() => toast.success('Whitepaper submitted'))
                    .catch((e) => toast.error(String(e.message ?? e)))
                }
              >
                Submit whitepaper
              </Button>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-sgvu-navy">Paid bounties</h2>
        {bounties.length === 0 ? (
          <p className="text-sm text-muted-foreground">No bounties available.</p>
        ) : (
          bounties.map((b) => (
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
                {b.status === 'OPEN' && (
                  <Button
                    size="sm"
                    onClick={() =>
                      c
                        .claimBounty(b.bounty_id)
                        .then((result) => {
                          const row = result as { bounty_id?: string } | null | undefined;
                          if (!row?.bounty_id) throw new Error('Bounty not available');
                          toast.success('Bounty claimed — admin will mark paid after review');
                          return reloadBounties();
                        })
                        .catch((e) => toast.error(String(e.message ?? e)))
                    }
                  >
                    Claim bounty
                  </Button>
                )}
                {b.status === 'CLAIMED' && b.claimed_by_name && (
                  <span className="text-sm text-muted-foreground">
                    Claimed by {b.claimed_by_name}
                  </span>
                )}
                {b.status === 'PAID' && (
                  <span className="text-sm font-medium text-emerald-700">Paid</span>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </section>
    </div>
  );
}
