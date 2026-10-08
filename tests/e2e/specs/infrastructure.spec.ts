import { test, expect } from '@playwright/test';

/**
 * Phase A — E2E infrastructure smoke only.
 * Workflow tests belong in Phase B.
 */
test.describe('Playwright infrastructure', () => {
  test('test runner executes', async () => {
    expect(true).toBe(true);
  });

  test('baseURL is configured', async () => {
    expect(process.env.FALCON_WEB_URL ?? 'http://localhost:3100').toContain('http');
  });
});
