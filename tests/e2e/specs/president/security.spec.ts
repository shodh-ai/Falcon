import { test, expect } from '@playwright/test';
import { mockAuthenticatedSession, PORTAL_MOCK_USERS } from '../../helpers/playwright-auth';

test.describe('President RBAC E2E', () => {
  test('faculty cannot access president executive summary', async ({ page }) => {
    await mockAuthenticatedSession(page, PORTAL_MOCK_USERS.faculty);
    await page.goto('/president/executive-summary');
    await expect(page.locator('body')).toBeVisible();
    await expect(
      page.getByText(/403 Forbidden|Switching Falcon workspace|Access denied/i).first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test('president session mock retains president portal path', async ({ page }) => {
    await mockAuthenticatedSession(page, PORTAL_MOCK_USERS.president);
    await page.goto('/president/executive-summary');
    expect(page.url()).toContain('/president');
  });
});
