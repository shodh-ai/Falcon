'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { createOperationsApi } from '@/lib/api/api.operations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/lib/notifications/falcon-toast';
import {
  findRelatedPartyCollisions,
  isValidGstinFormat,
  normalizeGstin,
  panFromGstin,
  panFromQuote,
} from '@/lib/gstin.util';

type QuoteForm = {
  vendor_name: string;
  gstin: string;
  amount_inr: string;
  pdf_path: string;
};

const emptyQuote = (): QuoteForm => ({
  vendor_name: '',
  gstin: '',
  amount_inr: '',
  pdf_path: '',
});

export default function ProcurementDeskPage() {
  const api = useAuthedApi();
  const ops = useMemo(() => createOperationsApi(api), [api]);
  const [inbox, setInbox] = useState<any[]>([]);
  const [active, setActive] = useState<any | null>(null);
  const [quote, setQuote] = useState<QuoteForm>(emptyQuote());
  const [selectedQuoteId, setSelectedQuoteId] = useState('');
  const [justification, setJustification] = useState('');

  const reload = async () => {
    const [submitted, sourcing, quoted] = await Promise.all([
      ops.requisitions('SUBMITTED'),
      ops.requisitions('SOURCING'),
      ops.requisitions('QUOTED'),
    ]);
    setInbox([...submitted, ...sourcing, ...quoted]);
  };

  useEffect(() => {
    void reload().catch(() => toast.error('Load failed'));
  }, [ops]);

  async function openPr(id: string) {
    const pr = await ops.getRequisition(id);
    setActive(pr);
    const lowest = (pr.quotes ?? []).find((q: any) => q.is_system_l1);
    setSelectedQuoteId(lowest?.quote_id ?? pr.quotes?.[0]?.quote_id ?? '');
  }

  async function uploadPdf(file: File) {
    const form = new FormData();
    form.append('file', file);
    const res = await api.post<{ path?: string; file_path?: string }>('/api/uploads/single', form);
    const path = res.path ?? res.file_path;
    if (!path) throw new Error('Upload missing path');
    setQuote((q) => ({ ...q, pdf_path: path }));
    toast.success('Quote PDF uploaded');
  }

  const quotes: any[] = active?.quotes ?? [];
  const minQuotes = Number(active?.quote_rule?.min_quotes ?? 1);
  const lowestId = quotes.find((q) => q.is_system_l1)?.quote_id;
  const selectingNonLowest = selectedQuoteId && lowestId && selectedQuoteId !== lowestId;
  const relatedPartyCollisions = findRelatedPartyCollisions(quotes);
  const hasRelatedPartyBlock = relatedPartyCollisions.length > 0;
  const draftGstin = normalizeGstin(quote.gstin);
  const draftPan = draftGstin ? panFromGstin(draftGstin) : null;
  const draftPanCollision =
    draftPan &&
    quotes.some((q) => {
      const existingPan = panFromQuote(q);
      return existingPan === draftPan;
    });
  const draftGstinInvalid = draftGstin.length > 0 && !isValidGstinFormat(draftGstin);

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-black text-sgvu-navy">Central Procurement</h1>
      <p className="text-sm text-muted-foreground max-w-2xl">
        Sourcing team only: claim PRs, upload 3 GST-verified quotes, lock the lowest bidder, and
        route to the DOFA hierarchy. You do not raise needs or pay invoices.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Sourcing inbox</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {inbox.map((r) => (
              <button
                key={r.pr_id}
                type="button"
                className="w-full text-left border rounded-md p-3 hover:bg-muted/40"
                onClick={() => void openPr(r.pr_id).catch((e) => toast.error(String(e?.message ?? e)))}
              >
                <div className="font-medium">{r.description}</div>
                <div className="text-muted-foreground">
                  ₹{Number(r.amount_estimate).toLocaleString('en-IN')} · {r.status}
                </div>
              </button>
            ))}
            {!inbox.length && <p className="text-muted-foreground">No PRs awaiting sourcing.</p>}
          </CardContent>
        </Card>

        {active && (
          <Card>
            <CardHeader>
              <CardTitle>{active.description}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="text-muted-foreground">
                ₹{Number(active.amount_estimate).toLocaleString('en-IN')} · {active.status}
                {active.technical_specs ? ` · ${active.technical_specs}` : ''}
              </div>

              {active.status === 'SUBMITTED' && (
                <Button
                  onClick={() =>
                    ops
                      .claimRequisition(active.pr_id)
                      .then(() => {
                        toast.success('Claimed for sourcing');
                        return Promise.all([reload(), openPr(active.pr_id)]);
                      })
                      .catch((e) => toast.error(String(e?.message ?? e)))
                  }
                >
                  Claim PR
                </Button>
              )}

              {['SOURCING', 'QUOTED'].includes(active.status) && (
                <>
                  {hasRelatedPartyBlock && (
                    <div className="rounded-md border border-red-300 bg-red-50 p-3 text-red-900">
                      <div className="font-semibold">Related-party quotes detected</div>
                      <p className="mt-1 text-xs">
                        These vendors share the same PAN — Lock vendor will be blocked. Quotes on this PR
                        cannot be edited; create a new PR with three GSTINs from different companies
                        (different PAN, not just the last digit).
                      </p>
                      <ul className="mt-2 list-disc pl-4 text-xs">
                        {relatedPartyCollisions.map(({ pan, vendors }) => (
                          <li key={pan}>
                            PAN {pan}: {vendors.join(', ')}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {quotes.map((q) => (
                    <label
                      key={q.quote_id}
                      className={`flex gap-2 items-start border rounded-md p-2 cursor-pointer ${
                        q.is_system_l1 ? 'border-emerald-500 bg-emerald-50/50' : ''
                      }`}
                    >
                      <input
                        type="radio"
                        checked={selectedQuoteId === q.quote_id}
                        onChange={() => setSelectedQuoteId(q.quote_id)}
                      />
                      <div>
                        <div className="font-medium">
                          {q.vendor_name} {q.is_system_l1 ? '(Lowest quote)' : ''}
                        </div>
                        <div>
                          ₹{Number(q.amount_inr).toLocaleString('en-IN')} · {q.gstin}
                          {panFromQuote(q) ? ` · PAN ${panFromQuote(q)}` : ''} · {q.gst_verify_status}
                        </div>
                      </div>
                    </label>
                  ))}

                  <div className="space-y-2 border-t pt-3">
                    <div className="font-medium">Add quote ({quotes.length}/{minQuotes} min)</div>
                    <p className="text-xs text-muted-foreground">
                      Each quote must be a different vendor (unique PAN). Example GSTINs for UAT:{' '}
                      <span className="font-mono">27AABCU9603R1ZM</span>,{' '}
                      <span className="font-mono">29AABCT1332L1ZV</span>,{' '}
                      <span className="font-mono">07AAACS4429R1ZR</span>.
                    </p>
                    <Input
                      placeholder="Vendor name"
                      value={quote.vendor_name}
                      onChange={(e) => setQuote({ ...quote, vendor_name: e.target.value })}
                    />
                    <Input
                      placeholder="GSTIN (15 chars — PAN is chars 3–12)"
                      value={quote.gstin}
                      onChange={(e) => setQuote({ ...quote, gstin: e.target.value.toUpperCase() })}
                    />
                    {draftGstinInvalid && (
                      <p className="text-xs text-amber-700">Invalid GSTIN format (need 15 characters).</p>
                    )}
                    {draftPan && !draftGstinInvalid && (
                      <p className="text-xs text-muted-foreground">Extracted PAN: {draftPan}</p>
                    )}
                    {draftPanCollision && (
                      <p className="text-xs text-red-700">
                        This PAN already appears on another quote — use a GSTIN from a different company.
                      </p>
                    )}
                    <Input
                      placeholder="Amount ₹"
                      type="number"
                      value={quote.amount_inr}
                      onChange={(e) => setQuote({ ...quote, amount_inr: e.target.value })}
                    />
                    <Input
                      type="file"
                      accept="application/pdf,image/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void uploadPdf(f).catch((err) => toast.error(String(err?.message ?? err)));
                      }}
                    />
                    <Button
                      variant="secondary"
                      disabled={
                        !quote.pdf_path ||
                        draftGstinInvalid ||
                        Boolean(draftPanCollision) ||
                        !quote.vendor_name.trim() ||
                        !(Number(quote.amount_inr) > 0)
                      }
                      onClick={() =>
                        ops
                          .addQuote(active.pr_id, {
                            vendor_name: quote.vendor_name,
                            gstin: draftGstin,
                            amount_inr: Number(quote.amount_inr),
                            pdf_path: quote.pdf_path,
                          })
                          .then(() => {
                            toast.success('Quote added');
                            setQuote(emptyQuote());
                            return openPr(active.pr_id);
                          })
                          .catch((e) => toast.error(String(e?.message ?? e)))
                      }
                    >
                      Save quote
                    </Button>
                  </div>

                  {selectingNonLowest && (
                    <Input
                      value={justification}
                      onChange={(e) => setJustification(e.target.value)}
                      placeholder="Why not the lowest quote? (red-flags leadership)"
                    />
                  )}

                  <Button
                    disabled={quotes.length < minQuotes || !selectedQuoteId || hasRelatedPartyBlock}
                    onClick={() =>
                      ops
                        .submitForApproval(active.pr_id, {
                          selected_quote_id: selectedQuoteId,
                          non_lowest_justification: selectingNonLowest
                            ? justification
                            : undefined,
                        })
                        .then((res) => {
                          toast.success(
                            `Routed to DOFA L${res.required_level} (${res.status})`,
                          );
                          return Promise.all([reload(), openPr(active.pr_id)]);
                        })
                        .catch((e) => toast.error(String(e?.message ?? e)))
                    }
                  >
                    Lock vendor → DOFA routing
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
