import type { Page } from '@playwright/test';
import { TEST_USERS } from '../../helpers/test-users';

export type MockPortalUser = {
  user_id?: string;
  name?: string;
  role: string;
  roles?: string[];
  primaryRole?: string;
  email: string;
  token?: string;
};

export async function mockAuthenticatedSession(page: Page, user: MockPortalUser): Promise<void> {
  const token = user.token ?? `e2e-mock-token-${user.role}`;
  const payload = {
    user_id: user.user_id ?? `e2e-${user.role.toLowerCase()}`,
    name: user.name ?? `E2E ${user.role}`,
    role: user.role,
    roles: user.roles ?? [user.role],
    primaryRole: user.primaryRole ?? user.role,
    email: user.email,
    onboarding_status: 'COMPLETED',
  };

  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    });
  });

  await page.route('**/api/auth/me/permissions', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ permissions: [] }),
    });
  });

  // Next middleware runs before client-side localStorage hydration, so portal
  // navigation also needs the same cookie written by AuthContext in real use.
  await page.context().addCookies([
    {
      name: 'falcon_auth_token',
      value: token,
      url: process.env.FALCON_WEB_URL ?? 'http://localhost:3100',
      sameSite: 'Lax',
    },
  ]);

  await page.addInitScript(
    ([t, u]) => {
      localStorage.setItem('token', t);
      localStorage.setItem('user', u);
    },
    [token, JSON.stringify(payload)],
  );
}

export const PORTAL_MOCK_USERS = {
  faculty: {
    role: 'Faculty',
    email: TEST_USERS.faculty.email,
  },
  hod: {
    role: 'HOD',
    email: TEST_USERS.hod.email,
  },
  dean: {
    role: 'Dean',
    email: TEST_USERS.dean.email,
  },
  examcell: {
    role: 'examcell',
    email: TEST_USERS.examcell.email,
  },
  registrar: {
    role: 'Registrar',
    email: TEST_USERS.registrar.email,
  },
  president: {
    role: 'President',
    roles: ['President'],
    primaryRole: 'President',
    email: TEST_USERS.president.email,
  },
} as const;
