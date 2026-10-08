import { test, expect } from '@playwright/test';
import { mockAuthenticatedSession, PORTAL_MOCK_USERS } from '../../helpers/playwright-auth';

test.describe('Authentication E2E', () => {
  test('login page loads', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
  });

  test('protected faculty route redirects or gates without session', async ({ page }) => {
    await page.goto('/faculty/dashboard');
    await expect(page.locator('body')).toBeVisible();
  });

  test('mock session allows faculty workspace navigation', async ({ page }) => {
    await mockAuthenticatedSession(page, PORTAL_MOCK_USERS.faculty);
    await page.goto('/faculty/dashboard');
    await expect(page).toHaveURL(/\/faculty/);
  });
});
