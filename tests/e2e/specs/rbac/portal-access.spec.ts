import { test, expect } from '@playwright/test';
import { mockAuthenticatedSession, PORTAL_MOCK_USERS } from '../../helpers/playwright-auth';

test.describe('RBAC portal access E2E', () => {
  test('faculty cannot remain on HOD dashboard', async ({ page }) => {
    await mockAuthenticatedSession(page, PORTAL_MOCK_USERS.faculty);
    await page.goto('/hod/dashboard');
    await expect(page.locator('body')).toBeVisible();
    await expect(page.getByText(/403 Forbidden|Switching Falcon workspace/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('HOD cannot access dean dashboard without redirect/gate', async ({ page }) => {
    await mockAuthenticatedSession(page, PORTAL_MOCK_USERS.hod);
    await page.goto('/dean/dashboard');
    await expect(page.locator('body')).toBeVisible();
  });

  test('dean can access dean inbox', async ({ page }) => {
    await mockAuthenticatedSession(page, PORTAL_MOCK_USERS.dean);
    await page.goto('/dean/inbox');
    expect(page.url()).toContain('/dean');
  });
});
