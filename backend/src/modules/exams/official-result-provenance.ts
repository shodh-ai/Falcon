/** Explicit fixture labels are not evidence of an official declaration. */
export function isQaDeclarationNote(note: unknown): boolean {
  if (typeof note !== 'string') return false;
  return (
    /^\s*smoke(?:\s*[:—-]|\s+(?:test|qa|demo)\b)/i.test(note) ||
    /^\s*(?:qa|demo|test)\s*[:—-]/i.test(note) ||
    /\b(?:qa|demo|sample|synthetic)\s+(?:data|fixtures?|seeds?|walkthrough|results?|records?)\b/i.test(note) ||
    /\btest\s+(?:data|fixtures?|seeds?|walkthrough)\b/i.test(note) ||
    /\b(?:seed(?:ed)?|fixture)\s+(?:data|results?|records?|for\s+(?:qa|testing|demo))\b/i.test(note) ||
    /\b(?:for\s+(?:testing|demo)\s+only|not\s+(?:an?\s+)?official\s+result)\b/i.test(note)
  );
}
