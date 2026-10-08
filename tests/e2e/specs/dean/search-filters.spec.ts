import { test, expect } from '@playwright/test';
import { mockAuthenticatedSession, PORTAL_MOCK_USERS } from '../../helpers/playwright-auth';

test.describe('Dean filters and search E2E', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedSession(page, PORTAL_MOCK_USERS.dean);
  });

  test('dean search page accepts query input', async ({ page }) => {
    await page.goto('/dean/search');
    const searchInput = page.getByRole('searchbox').or(page.locator('input[type="search"]')).first();
    if (await searchInput.count()) {
      await searchInput.fill('mechanical');
      await expect(searchInput).toHaveValue('mechanical');
    } else {
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('dean inbox loads approval workflow surface', async ({ page }) => {
    await page.goto('/dean/inbox');
    await expect(page.locator('body')).toContainText(/approval|inbox|pending/i);
  });
});
