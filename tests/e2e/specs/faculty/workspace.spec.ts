import { test, expect } from '@playwright/test';
import { mockAuthenticatedSession, PORTAL_MOCK_USERS } from '../../helpers/playwright-auth';
import { FACULTY_ROUTES } from '../../../helpers/workflow-routes';

test.describe('Faculty workspace E2E', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedSession(page, PORTAL_MOCK_USERS.faculty);
  });

  for (const [name, path] of Object.entries(FACULTY_ROUTES)) {
    test(`loads ${name} page`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('body')).toBeVisible();
      expect(page.url()).toContain('/faculty');
    });
  }
});
