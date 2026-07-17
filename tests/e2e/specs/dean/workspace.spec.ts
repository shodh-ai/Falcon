import { test, expect } from '@playwright/test';
import { mockAuthenticatedSession, PORTAL_MOCK_USERS } from '../../helpers/playwright-auth';
import { DEAN_ROUTES } from '../../../helpers/workflow-routes';

test.describe('Dean workspace E2E', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedSession(page, PORTAL_MOCK_USERS.dean);
  });

  for (const [name, path] of Object.entries(DEAN_ROUTES)) {
    test(`loads ${name} page`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('body')).toBeVisible();
      expect(page.url()).toContain('/dean');
    });
  }
});
