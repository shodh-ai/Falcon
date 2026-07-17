import { test, expect } from '@playwright/test';
import { mockAuthenticatedSession, PORTAL_MOCK_USERS } from '../../helpers/playwright-auth';
import { EXAM_CELL_ROUTES } from '../../../helpers/workflow-routes';

test.describe('Examination Cell workspace E2E', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedSession(page, PORTAL_MOCK_USERS.examcell);
  });

  for (const [name, path] of Object.entries(EXAM_CELL_ROUTES)) {
    test(`loads ${name} page`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('body')).toBeVisible();
      expect(page.url()).toContain('/exam-cell');
    });
  }
});
