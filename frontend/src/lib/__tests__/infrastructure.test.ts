import { expect } from 'vitest';

describe('Frontend test infrastructure', () => {
  it('vitest runner is configured', () => {
    expect(import.meta.env).toBeDefined();
  });

  it('path alias @ resolves', async () => {
    const { cn } = await import('@/lib/utils');
    expect(cn('a', false && 'b', 'c')).toBe('a c');
  });
});
