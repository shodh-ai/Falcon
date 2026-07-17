import { test, expect } from '@playwright/test';
import { mockAuthenticatedSession, PORTAL_MOCK_USERS } from '../../helpers/playwright-auth';

test.describe('Cross-module workflow pages E2E', () => {
  test('faculty attendance → HOD approvals pages render', async ({ page }) => {
    await mockAuthenticatedSession(page, PORTAL_MOCK_USERS.faculty);
    await page.goto('/faculty/attendance');
    await expect(page.locator('body')).toBeVisible();

    await mockAuthenticatedSession(page, PORTAL_MOCK_USERS.hod);
    await page.goto('/hod/approvals/leaves');
    await expect(page.locator('body')).toBeVisible();
  });

  test('HOD funding → dean budget workflow pages render', async ({ page }) => {
    await mockAuthenticatedSession(page, PORTAL_MOCK_USERS.hod);
    await page.goto('/hod/funding-approvals');
    await expect(page.locator('body')).toBeVisible();

    await mockAuthenticatedSession(page, PORTAL_MOCK_USERS.dean);
    await page.goto('/dean/budget');
    await expect(page.locator('body')).toBeVisible();
  });

  test('exam cell results → dean inbox workflow pages render', async ({ page }) => {
    await mockAuthenticatedSession(page, PORTAL_MOCK_USERS.examcell);
    await page.goto('/exam-cell/results');
    await expect(page.locator('body')).toBeVisible();

    await mockAuthenticatedSession(page, PORTAL_MOCK_USERS.dean);
    await page.goto('/dean/inbox');
    await expect(page.locator('body')).toBeVisible();
  });
});
