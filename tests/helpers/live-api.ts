import { testEnv } from './env';
import { isTestDatabaseAvailable } from './db';

export function isLiveApiEnabled(): boolean {
  return testEnv().liveApi;
}

export async function isLiveApiAvailable(): Promise<boolean> {
  const { apiUrl } = testEnv();
  try {
    const res = await fetch(`${apiUrl}/`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function isLiveStackReady(): Promise<boolean> {
  if (!isLiveApiEnabled()) return false;
  const api = await isLiveApiAvailable();
  if (!testEnv().testDbEnabled) return api;
  const db = await isTestDatabaseAvailable();
  return api && db;
}

/** Run live API tests when FALCON_LIVE_API=1 and backend responds. */
export function describeLiveApi(name: string, fn: () => void): void {
  const enabled = isLiveApiEnabled();
  const describeFn = enabled ? describe : describe.skip;
  describeFn(name, () => {
    beforeAll(async () => {
      if (!enabled) return;
      const ready = await isLiveApiAvailable();
      if (!ready) {
        console.warn(`[live-api] Skipping "${name}" — backend not reachable`);
      }
    });
    fn();
  });
}

/** Run DB workflow tests when FALCON_TEST_DB=1 and database is reachable. */
export function describeLiveDb(name: string, fn: () => void): void {
  const enabled = testEnv().testDbEnabled;
  const describeFn = enabled ? describe : describe.skip;
  describeFn(name, fn);
}
