import {
  isExamCellDevFallbackEnabled,
  resolveExamCellDevFallback,
} from '../exam-cell/dev-fallback';

describe('Examination Cell development fallback', () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllEnvs();
  });

  it('is disabled outside explicit local development opt-in', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXT_PUBLIC_EXAM_CELL_DEV_FALLBACK', 'true');
    expect(isExamCellDevFallbackEnabled()).toBe(false);
  });

  it('requires the explicit development flag', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(isExamCellDevFallbackEnabled()).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_EXAM_CELL_DEV_FALLBACK', 'true');
    expect(isExamCellDevFallbackEnabled()).toBe(true);
  });

  it('never simulates unknown mutation success', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_EXAM_CELL_DEV_FALLBACK', 'true');
    expect(
      resolveExamCellDevFallback('/api/exam-cell/unknown-mutation', 'POST'),
    ).toBeUndefined();
  });
});
