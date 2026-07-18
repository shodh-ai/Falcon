import { test, expect } from '@playwright/test';
import { mockAuthenticatedSession, PORTAL_MOCK_USERS } from '../../helpers/playwright-auth';
import { mockRegistrarApis } from '../../helpers/registrar-api-mocks';
import { REGISTRAR_ROUTES } from '../../../helpers/workflow-routes';

test.describe('Registrar workspace E2E', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedSession(page, PORTAL_MOCK_USERS.registrar);
    await mockRegistrarApis(page);
  });

  for (const [name, path] of Object.entries(REGISTRAR_ROUTES)) {
    test(`loads ${name} route (${path})`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('body')).toBeVisible();
      expect(page.url()).toContain(path.split('?')[0]);
    });
  }

  test('dashboard shows live registrar command center', async ({ page }) => {
    await page.goto(REGISTRAR_ROUTES.dashboard);
    await expect(page.getByTestId('registrar-dashboard')).toBeVisible();
    await expect(page.getByText('Registrar Command Center')).toBeVisible();
    await expect(page.getByTestId('registrar-exam-integration')).toBeVisible();
  });

  test('student verifications queue renders', async ({ page }) => {
    await page.goto(REGISTRAR_ROUTES.verifications);
    await expect(page.getByText(/verification|onboarding|pending/i).first()).toBeVisible();
  });

  test('academics page includes exam coordination links', async ({ page }) => {
    await page.goto(REGISTRAR_ROUTES.academics);
    await expect(page.getByTestId('registrar-academics')).toBeVisible();
    await expect(page.getByTestId('registrar-exam-integration')).toBeVisible();
    await expect(page.getByTestId('registrar-exam-link-convocation')).toBeVisible();
  });

  test('bulk upload page renders upload surface', async ({ page }) => {
    await page.goto(REGISTRAR_ROUTES.bulkUpload);
    await expect(page.getByText(/bulk|upload|excel/i).first()).toBeVisible();
  });

  test('PhD admissions queue renders', async ({ page }) => {
    await page.goto(REGISTRAR_ROUTES.phdAdmissions);
    await expect(page.getByText(/Ph\.?D\.?|registrar/i).first()).toBeVisible();
  });

  test('governance tasks page loads branded dashboard', async ({ page }) => {
    await page.goto(REGISTRAR_ROUTES.governanceTasks);
    await expect(page.getByText(/Welcome|governance|Suresh Gyan Vihar/i).first()).toBeVisible();
  });
});

test.describe('Registrar upload history E2E', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedSession(page, PORTAL_MOCK_USERS.registrar);
    await mockRegistrarApis(page);
  });

  test('dedicated upload history route works', async ({ page }) => {
    await page.goto('/admin/upload-history');
    await expect(page.getByTestId('registrar-upload-history')).toBeVisible();
    await expect(page.getByTestId('upload-history-table')).toBeVisible();
    await expect(page.getByTestId('upload-history-loading')).toBeHidden({ timeout: 10000 });
    await expect(page.getByTestId('upload-history-table').getByText('IQAC Monthly Evidence')).toBeVisible();
  });

  test('legacy section query redirects to dedicated route', async ({ page }) => {
    await page.goto('/admin/tasks?section=uploads');
    await expect(page).toHaveURL(/\/admin\/upload-history/, { timeout: 15000 });
  });

  test('upload history search filters rows', async ({ page }) => {
    await page.goto('/admin/upload-history');
    await expect(page.getByTestId('upload-history-loading')).toBeHidden({ timeout: 10000 });
    const table = page.getByTestId('upload-history-table');
    const search = page.getByTestId('upload-history-search');
    await search.fill('Governance Audit');
    await expect(table.getByText('Governance Audit')).toBeVisible();
    await expect(table.getByText('IQAC Monthly Evidence')).toHaveCount(0);
  });

  test('upload history task filter works', async ({ page }) => {
    await page.goto('/admin/upload-history');
    await expect(page.getByTestId('upload-history-loading')).toBeHidden({ timeout: 10000 });
    const table = page.getByTestId('upload-history-table');
    await page.getByTestId('upload-history-task-filter').selectOption('IQAC Monthly Evidence');
    await expect(table.getByText('IQAC Monthly Evidence')).toBeVisible();
    await expect(table.getByText('Governance Audit')).toHaveCount(0);
  });

  test('upload history supports file download action', async ({ page }) => {
    await page.goto('/admin/upload-history');
    await expect(page.getByTestId('upload-history-loading')).toBeHidden({ timeout: 10000 });
    await expect(page.getByTestId('upload-history-download-sub-1')).toBeVisible();
  });

  test('upload history shows empty state when API returns no rows', async ({ page }) => {
    await page.route('**/tasks/submissions/my**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });
    await page.goto('/admin/upload-history');
    await expect(page.getByTestId('upload-history-empty')).toBeVisible({ timeout: 10000 });
  });

  test('upload history shows error state on API failure', async ({ page }) => {
    await page.route('**/tasks/submissions/my**', async (route) => {
      await route.fulfill({ status: 500, body: 'Server error' });
    });
    await page.goto('/admin/upload-history');
    await expect(page.getByTestId('upload-history-error')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Registrar directory search and filters E2E', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedSession(page, PORTAL_MOCK_USERS.registrar);
    await mockRegistrarApis(page);
  });

  test('directory search accepts query', async ({ page }) => {
    await page.goto('/directory');
    const searchInput = page.getByRole('searchbox').or(page.locator('input[type="search"]')).first();
    await searchInput.fill('Test Student');
    await expect(searchInput).toHaveValue('Test Student');
  });

  test('directory shows filtered results from API', async ({ page }) => {
    await page.goto('/directory');
    await expect(page.getByText('Test Student')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Registrar RBAC navigation E2E', () => {
  test('registrar cannot remain on exam cell dashboard', async ({ page }) => {
    await mockAuthenticatedSession(page, PORTAL_MOCK_USERS.registrar);
    await page.goto('/exam-cell/dashboard');
    await expect(page.getByText(/403 Forbidden|Switching Falcon workspace/i).first()).toBeVisible({
      timeout: 10000,
    });
  });

  test('registrar admin sidebar includes upload history link', async ({ page }) => {
    await mockAuthenticatedSession(page, PORTAL_MOCK_USERS.registrar);
    await mockRegistrarApis(page);
    await page.goto('/admin/dashboard');
    await expect(page.getByRole('link', { name: /Upload History/i })).toBeVisible();
  });
});
