'use strict';

// Read-only diagnostic of the real synthetic Student session. No fixtures are
// created, no forms are submitted after login, and no screenshots/traces exist.
const fs = require('node:fs');
const path = require('node:path');
const { LOCAL, SUBDOMAIN, safetyConfig } = require('./core.cjs');
const { localOrigin, sanitize, browserRoutes, loadPlaywright, browserExecutable, collectEvidence, waitForFixtureEvidence } = require('./browser.cjs');

async function main() {
  const config = safetyConfig();
  const report = JSON.parse(fs.readFileSync(path.join(LOCAL, 'report.json'), 'utf8'));
  if (report.student?.subdomain !== SUBDOMAIN || report.environment?.database !== config.db.database)
    throw new Error('Dedicated fixture identity/environment unavailable.');
  const password = process.env.FALCON_SMOKE_PASSWORD;
  if (!password || password.length < 16) throw new Error('Private in-memory synthetic credential required.');
  const probe = await fetch(`${config.api}/api/auth/local-login`);
  if (probe.headers.get('x-falcon-smoke-environment') !== 'test' || probe.headers.get('x-falcon-smoke-database') !== config.db.database)
    throw new Error('Refusing unverified test API.');
  const web = 'http://falcon-student-smoke.localhost:3100';
  const allowed = new Set([localOrigin(web), config.api, 'http://falcon-student-smoke.localhost:4100']);
  const actors = { student: { email: report.student.email, password } };
  const clean = (value) => {
    if (typeof value === 'string') return sanitize(value, actors, 50000);
    if (Array.isArray(value)) return value.map(clean);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clean(item)]));
    return value;
  };
  const playwright = loadPlaywright();
  const executablePath = browserExecutable(playwright);
  if (!playwright || !executablePath) throw new Error('Installed browser is required; no download allowed.');
  const browser = await playwright.chromium.launch({ executablePath, headless: true,
    args: ['--host-resolver-rules=MAP *.localhost 127.0.0.1', '--disable-background-networking', '--no-first-run'] });
  const result = { environment: report.environment, studentId: report.student.userId, routes: [], errors: [] };
  const focus = new Set(String(process.env.FALCON_SMOKE_INSPECT_ROUTES || '').split('|').filter(Boolean));
  const output = path.join(LOCAL, focus.size ? 'debug-ui-focused.json' : 'debug-ui.json');
  let routeName = 'Login';
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-IN', timezoneId: 'Asia/Kolkata',
      serviceWorkers: 'block', acceptDownloads: false });
    await context.route('**/*', (route) => allowed.has(localOrigin(route.request().url())) || /^(data|blob|about):/.test(route.request().url())
      ? route.continue() : route.abort('blockedbyclient'));
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    page.on('console', (message) => { if (message.type() === 'error') result.errors.push({ route: routeName, message: clean(message.text()) }); });
    page.on('pageerror', (error) => result.errors.push({ route: routeName, message: clean(error.message) }));
    await page.goto(web, { waitUntil: 'domcontentloaded' });
    await page.getByLabel('Email or Student ID', { exact: true }).fill(actors.student.email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    const [login] = await Promise.all([
      page.waitForResponse((response) => new URL(response.url()).pathname === '/api/auth/local-login' && response.request().method() === 'POST'),
      page.getByRole('button', { name: 'Sign in with Password', exact: true }).click(),
    ]);
    const authenticated = await login.json();
    if (!login.ok() || authenticated.user?.user_id !== report.student.userId || authenticated.user?.tenant_id !== report.student.tenantId)
      throw new Error('Synthetic Student login identity mismatch.');
    const courses = require('./academics.cjs').buildAcademicPlan('2026-10-14', report.student.tenantId).current;
    const ctx = { actors, report };
    for (const route of browserRoutes({ courses }, ctx)) {
      if (focus.size && !focus.has(route.name)) continue;
      routeName = route.name;
      await page.goto(`${web}${route.path}`, { waitUntil: 'domcontentloaded' });
      if (route.heading) await page.getByRole('heading', { name: route.heading, exact: true }).first().waitFor();
      await page.waitForLoadState('networkidle');
      // Wait for existing page loaders rather than inspecting skeleton content.
      await page.waitForFunction(() => {
        const main = document.querySelector('main');
        return Boolean(main && !/Loading (your courses|profile|tickets|CBCS registration|timetable|academic calendar|attendance|documents|results)/i.test(main.innerText));
      }).catch(() => {});
      if (route.actions === 'semester-one') await page.getByRole('button', { name: /^Sem\s*1$/ }).click();
      if (route.actions === 'semester-two-internals') {
        await page.getByRole('button', { name: /^Sem\s*2$/ }).click();
        await page.getByRole('button', { name: 'Internal marks', exact: true }).click();
      }
      let evidenceError = null;
      try { await waitForFixtureEvidence(() => collectEvidence(page.locator('main').first(), route.evidence), route.evidence, 60000); }
      catch (error) { evidenceError = clean(error.message); }
      const selectors = [...new Set(['tbody tr', 'li', 'a[href*="/student/courses/"]', '.rounded-2xl.border.p-4', '.bg-card',
        ...(route.evidence?.records ?? []).map((record) => record.selector)])];
      const snapshot = await page.locator('main').first().evaluate((root, selectors) => {
        const visible = (element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
        return {
          content: root.innerText,
          inputs: [...root.querySelectorAll('input, textarea, select')].filter((element) => visible(element) &&
            !['password', 'hidden'].includes(element.type)).map((element) => ({ name: element.name, id: element.id, type: element.type, value: element.value })),
          buttons: [...root.querySelectorAll('button')].filter(visible).map((element) => ({ text: element.innerText, label: element.getAttribute('aria-label'),
            title: element.title, disabled: element.disabled })),
          rows: Object.fromEntries(selectors.map((selector) => [selector, [...root.querySelectorAll(selector)].filter(visible).map((element) => element.innerText)])),
        };
      }, selectors);
      result.routes.push({ name: route.name, path: route.path, evidenceError, ...clean(snapshot) });
      fs.writeFileSync(output, JSON.stringify(clean(result), null, 2));
      console.log(`Read-only DOM captured: ${route.name}`);
    }
  } finally {
    await browser.close();
    fs.writeFileSync(output, JSON.stringify(clean(result), null, 2));
  }
  console.log(`Read-only UI diagnostic saved locally; ${result.routes.length} routes, ${result.errors.length} observed console/page errors. No fixtures changed.`);
}

main().catch((error) => { console.error(sanitize(error.message)); process.exitCode = 1; });
