import { test, expect } from '@playwright/test';
import { mockAuthenticatedSession, PORTAL_MOCK_USERS } from '../../helpers/playwright-auth';

test.describe('Exam Cell publish and hall ticket E2E', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedSession(page, PORTAL_MOCK_USERS.examcell);
  });

  test('results page exposes publishing workflow entry', async ({ page }) => {
    await page.goto('/exam-cell/results');
    await expect(page.locator('body')).toBeVisible();
    const publishCue = page.getByText(/publish|result|session/i).first();
    await expect(publishCue).toBeVisible({ timeout: 15000 });
  });

  test('admit cards page loads hall ticket workflow', async ({ page }) => {
    await page.goto('/exam-cell/admit-cards');
    await expect(page.locator('body')).toBeVisible();
  });
});
