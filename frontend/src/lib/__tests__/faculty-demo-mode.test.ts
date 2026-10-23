import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isEmptyArray,
  isFacultyDemoModeEnabled,
  isFacultyDemoSmokeId,
  withFacultyDemoFallback,
} from '../faculty-demo-mode';

afterEach(() => vi.unstubAllEnvs());

describe('faculty data sources', () => {
  it('keeps empty live data empty in local development by default', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_FACULTY_DEMO_MODE', undefined);
    expect(isFacultyDemoModeEnabled()).toBe(false);
    expect(withFacultyDemoFallback([], ['sample incident'], isEmptyArray)).toEqual([]);
    expect(isFacultyDemoSmokeId('stu-demo-1')).toBe(false);
  });

  it.each(['true', '1', 'on'])('allows an explicit %s demo opt-in in development', (flag) => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_FACULTY_DEMO_MODE', flag);
    expect(withFacultyDemoFallback([], ['sample incident'], isEmptyArray)).toEqual(['sample incident']);
    expect(isFacultyDemoSmokeId('stu-demo-1')).toBe(true);
    expect(withFacultyDemoFallback(['real incident'], ['sample incident'], isEmptyArray)).toEqual(['real incident']);
  });

  it('never substitutes demo data in production, even with the flag enabled', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_FACULTY_DEMO_MODE', 'true');
    expect(isFacultyDemoModeEnabled()).toBe(false);
    expect(withFacultyDemoFallback([], ['sample incident'], isEmptyArray)).toEqual([]);
  });
});
