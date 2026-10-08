/**
 * Lightweight state-machine contract for certificate transitions.
 * Mirrors allowed map in RegistrarService.transitionCertificate.
 */
const ALLOWED: Record<string, string[]> = {
  GENERATE: ['DRAFT', 'REJECTED'],
  SIGN: ['GENERATED'],
  ISSUE: ['SIGNED'],
  REJECT: ['DRAFT', 'GENERATED'],
};

function canTransition(action: string, status: string) {
  return (ALLOWED[action] ?? []).includes(status);
}

describe('registrar certificate transitions', () => {
  it('allows the production happy path', () => {
    expect(canTransition('GENERATE', 'DRAFT')).toBe(true);
    expect(canTransition('SIGN', 'GENERATED')).toBe(true);
    expect(canTransition('ISSUE', 'SIGNED')).toBe(true);
  });

  it('blocks skipping GENERATE before SIGN', () => {
    expect(canTransition('SIGN', 'DRAFT')).toBe(false);
    expect(canTransition('ISSUE', 'GENERATED')).toBe(false);
    expect(canTransition('ISSUE', 'DRAFT')).toBe(false);
  });

  it('allows reject only before signature', () => {
    expect(canTransition('REJECT', 'DRAFT')).toBe(true);
    expect(canTransition('REJECT', 'GENERATED')).toBe(true);
    expect(canTransition('REJECT', 'SIGNED')).toBe(false);
    expect(canTransition('REJECT', 'ISSUED')).toBe(false);
  });

  it('allows regenerate after reject', () => {
    expect(canTransition('GENERATE', 'REJECTED')).toBe(true);
  });
});
