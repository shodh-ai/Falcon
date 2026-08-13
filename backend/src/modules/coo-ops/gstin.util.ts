/** Indian GSTIN: 2 digit state + 10 char PAN + entity + Z + checksum */
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

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

export function relatedPartyHash(
  pan: string | null | undefined,
  legalName?: string | null,
): string {
  const panPart = String(pan ?? '')
    .trim()
    .toUpperCase();
  const namePart = String(legalName ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return `${panPart}|${namePart}`;
}
