/**
 * Frontend E2E / component test auth helpers (Phase B).
 * Phase A: storage state placeholder only.
 */
export const TEST_AUTH_STORAGE = '.auth/user.json';

export type TestSession = {
  token: string;
  role: string;
  email: string;
};

export function buildMockSession(overrides: Partial<TestSession> = {}): TestSession {
  return {
    token: 'mock-jwt-token',
    role: 'user',
    email: 'test@example.com',
    ...overrides,
  };
}
