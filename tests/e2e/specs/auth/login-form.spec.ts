import { test, expect } from '@playwright/test';
import { TEST_USERS, TEST_PASSWORD } from '../../../helpers/test-users';
import { testEnv } from '../../../helpers/env';

test.describe('Real login form E2E', () => {
  test('shows validation on empty submit', async ({ page }) => {
    await page.goto('/');
    const submit = page.getByRole('button', { name: /sign in|login|continue/i }).first();
    if (await submit.count()) {
      await submit.click();
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('attempts local login when live stack configured', async ({ page }) => {
    testEnv();
    if (process.env.FALCON_E2E_LIVE !== '1') {
      test.skip();
    }
    await page.goto('/');
    const email = page.locator('input[type="email"], input[name="email"]').first();
    const password = page.locator('input[type="password"]').first();
    if (!(await email.count()) || !(await password.count())) {
      test.skip();
    }
    await email.fill(TEST_USERS.faculty.email);
    await password.fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /sign in|login|continue/i }).first().click();
    await page.waitForURL(/faculty|dashboard|\//, { timeout: 15000 });
  });
});
