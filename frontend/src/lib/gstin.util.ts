/** Indian GSTIN: 2 digit state + 10 char PAN + entity + Z + checksum */
const GSTIN_RE =
  /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export function normalizeGstin(gstin: string): string {
  return String(gstin ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

export function isValidGstinFormat(gstin: string): boolean {
  return GSTIN_RE.test(normalizeGstin(gstin));
}

export function panFromGstin(gstin: string): string | null {
  const g = normalizeGstin(gstin);
  if (!isValidGstinFormat(g)) return null;
  return g.slice(2, 12);
}

export function panFromQuote(quote: { gstin?: string; related_party_hash?: string | null }): string | null {
  const fromHash = String(quote.related_party_hash ?? '').split('|')[0]?.trim();
  if (fromHash && fromHash.length === 10) return fromHash;
  return quote.gstin ? panFromGstin(quote.gstin) : null;
}

export function findRelatedPartyCollisions(
  quotes: Array<{ quote_id?: string; vendor_name?: string; gstin?: string; related_party_hash?: string | null }>,
): Array<{ pan: string; vendors: string[] }> {
  const byPan = new Map<string, string[]>();
  for (const q of quotes) {
    const pan = panFromQuote(q);
    if (!pan) continue;
    const label = q.vendor_name?.trim() || q.gstin || 'Unknown';
    const list = byPan.get(pan) ?? [];
    if (!list.includes(label)) list.push(label);
    byPan.set(pan, list);
  }
  return [...byPan.entries()]
    .filter(([, vendors]) => vendors.length > 1)
    .map(([pan, vendors]) => ({ pan, vendors }));
}
