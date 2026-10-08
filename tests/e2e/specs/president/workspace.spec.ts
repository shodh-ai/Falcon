import { test, expect } from '@playwright/test';
import { mockAuthenticatedSession, PORTAL_MOCK_USERS } from '../../helpers/playwright-auth';
import { mockPresidentApis } from '../../helpers/president-api-mocks';
import { PRESIDENT_ROUTES } from '../../../helpers/president-routes';

test.describe('President workspace navigation E2E', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedSession(page, PORTAL_MOCK_USERS.president);
    await mockPresidentApis(page);
  });

  for (const [name, path] of Object.entries(PRESIDENT_ROUTES)) {
    test(`loads ${name} without console errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
      });
      const res = await page.goto(path);
      expect(res?.status()).toBeLessThan(500);
      await expect(page.locator('body')).toBeVisible();
      expect(page.url()).toContain('/president');
      const hydrationErrors = errors.filter(
        (e) => e.includes('Hydration') || e.includes('404') || e.includes('500'),
      );
      expect(hydrationErrors, hydrationErrors.join('; ')).toHaveLength(0);
    });
  }
});
