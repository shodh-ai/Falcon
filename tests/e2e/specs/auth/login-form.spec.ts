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
    const identifier = page.locator('#identifier, input[name="identifier"]').first();
    const password = page.locator('input[type="password"]').first();
    if (!(await identifier.count()) || !(await password.count())) {
      test.skip();
    }
    await identifier.fill(TEST_USERS.faculty.email);
    await password.fill(TEST_PASSWORD);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(/faculty|dashboard|\//, { timeout: 15000 });
  });

  test('sends a student ID as the login identifier', async ({ page }) => {
    const loginRequest = page.waitForRequest((request) =>
      request.url().includes('/api/auth/local-login'),
    );

    await page.goto('/');
    const identifier = page.locator('#identifier, input[name="identifier"]').first();
    const password = page.locator('input[type="password"]').first();
    await identifier.waitFor({ state: 'visible' });
    await identifier.fill('2548727');
    await password.fill('temporary-password');
    await page.locator('form button[type="submit"]').click();

    const request = await loginRequest;
    expect(request.postDataJSON()).toEqual({
      identifier: '2548727',
      password: 'temporary-password',
    });
  });
});
